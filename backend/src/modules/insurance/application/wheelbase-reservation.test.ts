jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { config } from '../../../config';
import { notificationService } from '../../notifications/application/notification.service';
import { wheelbaseReservationSchema, wheelbaseReservationService, reservationState } from './wheelbase-reservation.service';
import { WheelbaseReservationModel } from '../infrastructure/wheelbase-reservation.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HubModel } from '../../hubs/infrastructure/hub.model';
import { HubPayoutModel } from '../../hubs/infrastructure/hub-payout.model';
import { hubPayoutService } from '../../hubs/application/hub-payout.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

const SECRET = 'z'.repeat(40);
const wb = config.wheelbase as { webhookSecret: string };

beforeAll(connectTestDb);
afterAll(async () => {
  await clearTestDb();
  await disconnectTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  wb.webhookSecret = SECRET;
  (notificationService.send as jest.Mock).mockClear();
  await HubModel.collection.insertOne({ _id: 'hou', code: 'HOU', name: 'Houston', status: 'live', operatorUserId: 'op-hou', economics: {} } as never);
  await VehicleModel.collection.insertOne({
    _id: 'car-1' as never, hubId: 'hou', location: { type: 'Point', coordinates: [-95.36, 29.76], city: 'Houston', state: 'TX' }, year: 2024, make: 'Buick', model: 'Envista', status: 'listed', deletedAt: null,
    wheelbase: { rentalId: 504956, name: 'Envista', linkedBy: 'admin', insuranceState: 'approved', found: true },
  });
});

const body = (over: Record<string, unknown> = {}) =>
  wheelbaseReservationSchema.parse({ reservationId: '9001', rentalId: '504956', status: 'approved', from: '2026-12-01', to: '2026-12-04', amount: '$450.00', renterName: 'Ana P', ...over });
const bookedDays = async () => (await AvailabilityModel.find({ vehicleId: 'car-1' }).lean()).map((r) => r.dayKey).sort();

describe('the Zapier caller', () => {
  it('needs the shared secret, and nothing gets in while none is set', () => {
    expect(() => wheelbaseReservationService.assertCaller(SECRET)).not.toThrow();
    expect(() => wheelbaseReservationService.assertCaller('wrong')).toThrow('Invalid Wheelbase webhook secret');
    expect(() => wheelbaseReservationService.assertCaller(undefined)).toThrow();
    wb.webhookSecret = '';
    expect(() => wheelbaseReservationService.assertCaller('')).toThrow();
  });

  it('rejects a body with no dates or a return before pickup', () => {
    expect(() => wheelbaseReservationSchema.parse({ reservationId: '1', rentalId: '2', status: 'approved' })).toThrow();
    expect(() => body({ from: '2026-12-04', to: '2026-12-01' })).toThrow();
    expect(() => body({ reservationId: '../x' })).toThrow();
  });
});

describe('a Wheelbase reservation', () => {
  it('books the car’s days, tells the city once, and is safe to receive twice', async () => {
    expect(await wheelbaseReservationService.ingest(body())).toMatchObject({ state: 'active', linked: true });
    await wheelbaseReservationService.ingest(body());
    expect(await bookedDays()).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']);
    expect(await WheelbaseReservationModel.findById('9001').lean()).toMatchObject({ hubId: 'hou', vehicleId: 'car-1', amountCents: 45_000, renterName: 'Ana P' });
    expect(notificationService.send).toHaveBeenCalledTimes(1);
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'op-hou', templateKey: 'hub.wheelbase_booking' }));
  });

  it('moves the days when the dates change and frees them when cancelled', async () => {
    await wheelbaseReservationService.ingest(body());
    await wheelbaseReservationService.ingest(body({ from: '2026-12-10', to: '2026-12-12' }));
    expect(await bookedDays()).toEqual(['2026-12-10', '2026-12-11', '2026-12-12']);
    await wheelbaseReservationService.ingest(body({ status: 'cancelled_renter' }));
    expect(await bookedDays()).toEqual([]);
  });

  it('ignores an update older than the one already recorded', async () => {
    await wheelbaseReservationService.ingest(body({ status: 'cancelled_owner', updatedAt: '2026-11-20T10:00:00Z' }));
    expect(await wheelbaseReservationService.ingest(body({ status: 'approved', updatedAt: '2026-11-20T09:00:00Z' }))).toMatchObject({ ignored: 'stale', state: 'cancelled' });
    expect(await bookedDays()).toEqual([]);
  });

  it('keeps a reservation for an unlinked listing and attaches it once the car is linked', async () => {
    await wheelbaseReservationService.ingest(body({ rentalId: '777' }));
    expect(await WheelbaseReservationModel.findById('9001').lean()).not.toHaveProperty('vehicleId');
    expect(await wheelbaseReservationService.attachToVehicle(777, 'car-1')).toBe(1);
    expect(await bookedDays()).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']);
    expect(await WheelbaseReservationModel.findById('9001').lean()).toMatchObject({ vehicleId: 'car-1', hubId: 'hou' });
  });

  it('reads Wheelbase status words', () => {
    expect(['negotiating', 'approved', 'imminent', 'handed_off'].map(reservationState)).toEqual(['active', 'active', 'active', 'active']);
    expect(['returned', 'completed'].map(reservationState)).toEqual(['completed', 'completed']);
    expect(['cancelled_renter', 'declined', 'expired'].map(reservationState)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });
});

describe('the city statement', () => {
  it('counts ended, uncancelled Wheelbase trips and shows them separately', async () => {
    await wheelbaseReservationService.ingest(body({ reservationId: '1', from: '2026-10-01', to: '2026-10-05', amount: 400, status: 'returned' }));
    await wheelbaseReservationService.ingest(body({ reservationId: '2', from: '2026-10-20', to: '2026-10-22', amount: '200', status: 'handed_off' }));
    await wheelbaseReservationService.ingest(body({ reservationId: '3', from: '2026-10-10', to: '2026-10-12', amount: 900, status: 'cancelled_owner' }));
    await wheelbaseReservationService.ingest(body({ reservationId: '4', from: '2026-10-30', to: '2026-11-02', amount: 700 }));

    await hubPayoutService.run(new Date('2026-11-05T12:00:00Z'));
    expect(await HubPayoutModel.findOne({ hubId: 'hou' }).lean()).toMatchObject({
      period: '2026-10', trips: 2, grossCents: 60_000, wheelbaseTrips: 2, wheelbaseGrossCents: 60_000, amountCents: 6_000,
    });
  });
});
