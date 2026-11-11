const listings = jest.fn();
jest.mock('../infrastructure/wheelbase.client', () => ({ fetchDealerListings: (...a: unknown[]) => listings(...a) }));

import { wheelbaseInsuranceService, insuranceStatusOf } from './wheelbase-insurance.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { WheelbaseSyncStateModel } from '../infrastructure/wheelbase-sync-state.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { searchService } from '../../search/application/search.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import * as eventBus from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import { seedTestHub, TEST_HUB_ID } from '../../../testing/hub';

const HOUR = 3_600_000;
let insuranceCfg: Record<string, unknown> = {};

beforeAll(connectTestDb);
afterAll(async () => {
  await clearTestDb();
  await disconnectTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  await seedTestHub();
  listings.mockReset();
  jest.restoreAllMocks();
  insuranceCfg = {};
  // The real dealer ID lives only in the server env; tests use a placeholder.
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockImplementation(async () => ({ ...real, insurance: { ...real.insurance, wheelbaseDealerId: '1', ...insuranceCfg } }));
});

// Shaped like the dealer's real listings: two 2023 Traverses make a plain year/make/model match ambiguous.
const WB = [
  { id: 504956, name: '2024 Buick Envista', year: 2024, make: 'Buick', model: 'Envista', insuranceState: 'approved', coverage: 'normal', planLabel: 'Wheelbase Auto Driving', minRenterAge: 21 },
  { id: 504965, name: '2023 Chevrolet Traverse', year: 2023, make: 'Chevrolet', model: 'Traverse', insuranceState: 'approved', coverage: 'custom', minRenterAge: 21 },
  { id: 504501, name: '2023 Chevrolet Traverse FWD Premier', year: 2023, make: 'Chevrolet', model: 'Traverse FWD Premier', insuranceState: 'approved', coverage: 'normal', minRenterAge: 25 },
];

const car = (id: string, year: number, make: string, model: string, hubId = TEST_HUB_ID) =>
  VehicleModel.collection.insertOne({ _id: id as never, year, make, model, status: 'listed', verificationStatus: 'verified', hubId, deletedAt: null });

describe('wheelbase insurance sync', () => {
  it('links nothing on its own by default, because the account may hold another company’s cars', async () => {
    listings.mockResolvedValue(WB);
    await car('buick', 2024, 'Buick', 'Envista');

    const r = await wheelbaseInsuranceService.sync();
    expect(r).toMatchObject({ listings: 3, autoLinked: 0, unmatched: 1 });
    expect((await VehicleModel.findById('buick').lean())!.wheelbase).toBeUndefined();

    await wheelbaseInsuranceService.link('buick', 504956);
    expect((await VehicleModel.findById('buick').lean())!.wheelbase).toMatchObject({ rentalId: 504956, linkedBy: 'admin', insuranceState: 'approved' });
  });

  it('with auto-linking on, links a unique match, leaves an ambiguous one for an admin, and refreshes linked cars', async () => {
    insuranceCfg = { autoLink: true };
    listings.mockResolvedValue(WB);
    await car('buick', 2024, 'Buick', 'Envista');
    await car('traverse', 2023, 'Chevrolet', 'Traverse');

    const r = await wheelbaseInsuranceService.sync();
    expect(r).toMatchObject({ listings: 3, autoLinked: 1, unmatched: 1 });
    const buick = await VehicleModel.findById('buick').lean();
    expect(buick!.wheelbase).toMatchObject({ rentalId: 504956, linkedBy: 'auto', insuranceState: 'approved', minRenterAge: 21, found: true });

    await wheelbaseInsuranceService.link('traverse', 504501);
    expect((await VehicleModel.findById('traverse').lean())!.wheelbase).toMatchObject({ rentalId: 504501, linkedBy: 'admin', minRenterAge: 25 });

    // A Wheelbase listing covers every identical car in its group, so two cars may share it.
    await car('buick2', 2024, 'Buick', 'Envista');
    await wheelbaseInsuranceService.sync();
    expect((await VehicleModel.findById('buick2').lean())!.wheelbase).toMatchObject({ rentalId: 504956, linkedBy: 'auto' });
  });

  it('keeps a missing listing’s last reading for the grace window, then stops the car being booked', async () => {
    insuranceCfg = { missingGraceHours: 48 };
    const emitted = jest.spyOn(eventBus, 'emit');
    listings.mockResolvedValue(WB);
    await car('buick', 2024, 'Buick', 'Envista');
    await wheelbaseInsuranceService.link('buick', 504956);

    const t0 = new Date('2026-11-01T00:00:00Z');
    listings.mockResolvedValue([]);
    await wheelbaseInsuranceService.sync(t0);
    let wb = (await VehicleModel.findById('buick').lean())!.wheelbase!;
    expect(wb).toMatchObject({ insuranceState: 'approved', found: false });
    expect(new Date(wb.missingSince!).toISOString()).toBe(t0.toISOString());
    expect(insuranceStatusOf(wb)).toBe('missing');

    // Still inside the window: the first sighting is kept, not moved forward.
    await wheelbaseInsuranceService.sync(new Date(t0.getTime() + 47 * HOUR));
    wb = (await VehicleModel.findById('buick').lean())!.wheelbase!;
    expect(wb.insuranceState).toBe('approved');
    expect(new Date(wb.missingSince!).toISOString()).toBe(t0.toISOString());

    const r = await wheelbaseInsuranceService.sync(new Date(t0.getTime() + 48 * HOUR));
    expect(r).toMatchObject({ missing: 1, lapsed: 1 });
    expect((await VehicleModel.findById('buick').lean())!.wheelbase).toMatchObject({ insuranceState: 'missing', found: false });
    expect(emitted).toHaveBeenCalledWith(EVENTS.INSURANCE_STATUS_CHANGED, 'buick', expect.objectContaining({ from: 'approved', to: 'missing' }));

    // Back in the account: the fresh reading replaces the missing state.
    listings.mockResolvedValue(WB);
    await wheelbaseInsuranceService.sync(new Date(t0.getTime() + 50 * HOUR));
    wb = (await VehicleModel.findById('buick').lean())!.wheelbase!;
    expect(wb).toMatchObject({ insuranceState: 'approved', found: true });
    expect(wb.missingSince).toBeUndefined();
  });

  it('an outage changes no car, is recorded, and alerts staff once when it lasts too long', async () => {
    insuranceCfg = { staleAlertHours: 24 };
    const emitted = jest.spyOn(eventBus, 'emit');
    listings.mockResolvedValue(WB);
    await car('buick', 2024, 'Buick', 'Envista');
    await wheelbaseInsuranceService.link('buick', 504956);
    const t0 = new Date('2026-11-01T00:00:00Z');
    await wheelbaseInsuranceService.sync(t0);

    listings.mockRejectedValue(new Error('down'));
    await expect(wheelbaseInsuranceService.sync(new Date(t0.getTime() + 6 * HOUR))).resolves.toEqual({ error: 'unreachable' });
    expect((await VehicleModel.findById('buick').lean())!.wheelbase).toMatchObject({ insuranceState: 'approved' });
    expect(await WheelbaseSyncStateModel.findById('wheelbase').lean()).toMatchObject({ lastError: 'unreachable' });
    expect(emitted).not.toHaveBeenCalledWith(EVENTS.INSURANCE_SYNC_STALE, expect.anything(), expect.anything());

    await wheelbaseInsuranceService.sync(new Date(t0.getTime() + 24 * HOUR));
    await wheelbaseInsuranceService.sync(new Date(t0.getTime() + 30 * HOUR));
    expect(emitted.mock.calls.filter(([name]) => name === EVENTS.INSURANCE_SYNC_STALE)).toHaveLength(1);

    // A good read clears the error and re-arms the alert.
    listings.mockResolvedValue(WB);
    await wheelbaseInsuranceService.sync(new Date(t0.getTime() + 31 * HOUR));
    const state = await WheelbaseSyncStateModel.findById('wheelbase').lean();
    expect(state?.lastError).toBeUndefined();
    expect(state?.staleAlertedAt).toBeUndefined();
  });

  it('with no account number, records that Wheelbase is not set up', async () => {
    insuranceCfg = { wheelbaseDealerId: '' };
    await expect(wheelbaseInsuranceService.sync()).resolves.toEqual({ skipped: 'no_dealer' });
    expect(listings).not.toHaveBeenCalled();
    expect(await WheelbaseSyncStateModel.findById('wheelbase').lean()).toMatchObject({ lastError: 'not_set_up' });
  });
});

describe('what guests and cities see', () => {
  const insuredCar = (id: string, insuranceState?: string, hubId = TEST_HUB_ID) =>
    VehicleModel.collection.insertOne({
      _id: id as never, status: 'listed', verificationStatus: 'verified', hubId, deletedAt: null,
      year: 2024, make: 'Buick', model: 'Envista', pricing: { dailyPrice: 50 },
      location: { type: 'Point', coordinates: [-96.8, 32.78], city: 'Dallas', state: 'TX' },
      ...(insuranceState ? { wheelbase: { rentalId: 1, name: 'Car', linkedBy: 'admin', insuranceState, found: true, syncedAt: new Date() } } : {}),
    });

  it('guests only see the cars they could book, and see every car once the rule is off', async () => {
    await insuredCar('approved', 'approved');
    await insuredCar('pending', 'pending');
    await insuredCar('unlinked');
    expect((await searchService.recommendFor('nobody')).map((v) => v._id)).toEqual(['approved']);

    insuranceCfg = { requireApproved: false };
    expect((await searchService.recommendFor('nobody')).map((v) => v._id).sort()).toEqual(['approved', 'pending', 'unlinked']);
  });

  it('a guest on a direct link is told whether the car can be booked', async () => {
    await insuredCar('approved', 'approved');
    await insuredCar('pending', 'pending');
    expect(await vehicleService.getForViewer(undefined, 'approved')).toMatchObject({ bookable: true, insurance: { approved: true } });
    expect(await vehicleService.getForViewer(undefined, 'pending')).toMatchObject({ bookable: false });
  });

  it('a city sees only its own cars, each with its status', async () => {
    await insuredCar('mine-ok', 'approved');
    await insuredCar('mine-unlinked');
    await insuredCar('theirs', 'approved', 'hub-other');
    const r = await wheelbaseInsuranceService.forHub(TEST_HUB_ID);
    expect(r.cars.map((c) => [c.id, c.insurance, c.bookable]).sort()).toEqual([
      ['mine-ok', 'approved', true],
      ['mine-unlinked', 'not_linked', false],
    ]);
  });

  it('HQ sees every car with its city, and can narrow to one city', async () => {
    listings.mockResolvedValue(WB);
    await insuredCar('mine-ok', 'approved');
    await insuredCar('theirs', 'approved', 'hub-other');
    const all = await wheelbaseInsuranceService.overview();
    expect(all.cars).toHaveLength(2);
    expect(all.cars.find((c) => c._id === 'mine-ok')!.hub).toMatchObject({ code: 'TST', name: 'Test City' });
    expect(all.listings[0]).not.toHaveProperty('details');
    const one = await wheelbaseInsuranceService.overview({ hubId: TEST_HUB_ID });
    expect(one.cars.map((c) => c._id)).toEqual(['mine-ok']);
  });

  it('finds the trips still to start on a car, so staff can move them', async () => {
    const soon = new Date(Date.now() + 48 * HOUR);
    const base = { guestId: 'g', hostId: 'h', vehicleId: 'car-x', hubId: TEST_HUB_ID };
    await BookingModel.collection.insertMany([
      { _id: 'b1' as never, code: 'CC-1', status: 'paid', period: { start: soon, end: new Date(soon.getTime() + 24 * HOUR) }, ...base },
      { _id: 'b2' as never, code: 'CC-2', status: 'cancelled_guest', period: { start: soon, end: soon }, ...base },
      { _id: 'b3' as never, code: 'CC-3', status: 'in_progress', period: { start: new Date(Date.now() - HOUR), end: soon }, ...base },
    ]);
    expect((await wheelbaseInsuranceService.upcomingTrips('car-x')).map((t) => t.code)).toEqual(['CC-1']);
  });
});

describe('insurance rules at booking', () => {
  const pickup = new Date('2026-10-10T15:00:00Z');
  const insured = (minRenterAge: number, insuranceState = 'approved') =>
    VehicleModel.collection.insertOne({
      _id: 'car' as never, status: 'listed', deletedAt: null,
      wheelbase: { rentalId: 1, name: 'Car', linkedBy: 'admin', insuranceState, minRenterAge, found: true, syncedAt: new Date() },
    });
  const guest = (dob: string, verifiedDob?: string) =>
    Promise.all([
      UserModel.collection.insertOne({ _id: 'g' as never, email: 'g@x.com', dateOfBirth: dob }),
      verifiedDob ? KycModel.collection.insertOne({ userId: 'g', status: 'approved', verifiedDob: new Date(verifiedDob) } as never) : null,
    ]);

  it('refuses a driver younger than the car’s minimum, judged at pickup', async () => {
    await insured(25);
    await guest('2002-01-01'); // 24 at pickup
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).rejects.toMatchObject({ code: 'RENTER_TOO_YOUNG' });
  });

  it('prefers the verified ID’s date of birth over the profile', async () => {
    await insured(21);
    await guest('1990-01-01', '2008-01-01'); // profile says 36, ID says 18
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).rejects.toMatchObject({ code: 'RENTER_TOO_YOUNG' });
  });

  it('passes an old-enough driver on an approved car', async () => {
    await insured(21);
    await guest('1990-01-01');
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).resolves.toBeUndefined();
  });

  it('refuses a car that is not approved, or not linked at all', async () => {
    await insured(21, 'pending');
    await guest('1990-01-01');
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).rejects.toMatchObject({ code: 'INSURANCE_NOT_APPROVED' });
    await expect(wheelbaseInsuranceService.assertInsurable('no-such-car', 'g', pickup)).rejects.toMatchObject({ code: 'INSURANCE_NOT_APPROVED' });
  });
});
