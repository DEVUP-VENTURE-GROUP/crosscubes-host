const listings = jest.fn();
const blocked = jest.fn();
jest.mock('../infrastructure/wheelbase.client', () => ({
  fetchDealerListings: (...a: unknown[]) => listings(...a),
  fetchBlockedRanges: (...a: unknown[]) => blocked(...a),
}));

import { wheelbaseInsuranceService, CALENDAR_REF, type WheelbaseSyncResult } from './wheelbase-insurance.service';
import { fuelOf, transmissionOf } from './wheelbase-listing-import';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { HubModel } from '../../hubs/infrastructure/hub.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { WheelbaseImportModel } from '../infrastructure/wheelbase-import.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import { seedTestHub, TEST_HUB_ID } from '../../../testing/hub';

let insuranceCfg: Record<string, unknown> = {};
const NOW = new Date('2026-12-01T15:00:00Z');

beforeAll(connectTestDb);
afterAll(async () => {
  await clearTestDb();
  await disconnectTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  await seedTestHub();
  await HostModel.create({ _id: 'fleet-host', userId: 'fleet-user', displayName: 'Dallas fleet', verificationStatus: 'verified' });
  await HubModel.updateOne({ _id: TEST_HUB_ID }, { $set: { operatorHostId: 'fleet-host' } });
  listings.mockReset();
  blocked.mockReset().mockResolvedValue([]);
  jest.restoreAllMocks();
  insuranceCfg = {};
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockImplementation(async () => ({ ...real, insurance: { ...real.insurance, wheelbaseDealerId: '1', ...insuranceCfg } }));
});

const listing = (id: number, over: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({
  id,
  name: '2024 Buick Envista',
  year: 2024,
  make: 'Buick',
  model: 'Envista',
  insuranceState: 'approved',
  minRenterAge: 21,
  ...over,
  details: {
    photoUrls: ['https://img.example/1.jpg', 'https://img.example/2.jpg'],
    features: ['bluetooth'],
    fuelType: 'gas',
    transmission: 'automatic',
    seats: 5,
    pricePerDayCents: 6500,
    description: 'Clean and quiet.',
    bodyClass: 'SUV',
    location: { city: 'Dallas', state: 'TX', lat: 32.78, lng: -96.8 },
    ...details,
  },
});

const carFor = (rentalId: number) => VehicleModel.findOne({ 'wheelbase.rentalId': rentalId, deletedAt: null }).lean();

describe('cars come from the Wheelbase account', () => {
  it('adds a listing inside a city as a live car under that city’s fleet, once', async () => {
    listings.mockResolvedValue([listing(504956)]);
    expect(await wheelbaseInsuranceService.sync(NOW)).toMatchObject({ imported: 1, skipped: [] });
    await wheelbaseInsuranceService.sync(NOW);

    expect(await VehicleModel.countDocuments({})).toBe(1);
    expect(await carFor(504956)).toMatchObject({
      hostId: 'fleet-host',
      hubId: TEST_HUB_ID,
      status: 'listed',
      verificationStatus: 'verified',
      make: 'Buick',
      fuelType: 'petrol',
      transmission: 'automatic',
      seats: 5,
      pricing: { dailyPrice: 6500 },
      location: { city: 'Dallas', state: 'TX' },
      listing: { title: '2024 Buick Envista', description: 'Clean and quiet.' },
      wheelbase: { rentalId: 504956, linkedBy: 'import', insuranceState: 'approved' },
    });
    expect((await carFor(504956))!.photos.map((p) => p.url)).toEqual(['https://img.example/1.jpg', 'https://img.example/2.jpg']);
  });

  it('says why a listing was not added: outside every city, no fleet account, or details missing', async () => {
    listings.mockResolvedValue([
      listing(1, {}, { location: { city: 'Denver', state: 'CO', lat: 39.74, lng: -104.99 } }),
      listing(2, {}, { fuelType: undefined, seats: undefined }),
    ]);
    const r = await wheelbaseInsuranceService.sync(NOW);
    expect(r).toMatchObject({ imported: 0 });
    expect((r as WheelbaseSyncResult).skipped).toEqual([
      { rentalId: 1, name: '2024 Buick Envista', reason: 'Denver is not inside any CrossCubes city' },
      { rentalId: 2, name: '2024 Buick Envista', reason: 'The Wheelbase listing has no fuel type, seats' },
    ]);
    expect(await WheelbaseImportModel.countDocuments({})).toBe(0);

    await HubModel.updateOne({ _id: TEST_HUB_ID }, { $unset: { operatorHostId: 1 } });
    listings.mockResolvedValue([listing(3)]);
    const again = await wheelbaseInsuranceService.sync(NOW);
    expect((again as WheelbaseSyncResult).skipped[0]?.reason).toBe('Test City has no fleet account yet');
  });

  it('keeps the car’s price, photos and words in step with Wheelbase, and never brings back a deleted car', async () => {
    listings.mockResolvedValue([listing(504956)]);
    await wheelbaseInsuranceService.sync(NOW);
    listings.mockResolvedValue([listing(504956, {}, { pricePerDayCents: 7900, photoUrls: ['https://img.example/9.jpg'] })]);
    await wheelbaseInsuranceService.sync(NOW);
    const car = await carFor(504956);
    expect(car).toMatchObject({ pricing: { dailyPrice: 7900 } });
    expect(car!.photos).toEqual([{ url: 'https://img.example/9.jpg', isCover: true }]);

    await VehicleModel.updateOne({ _id: car!._id }, { $set: { deletedAt: new Date() } });
    expect(await wheelbaseInsuranceService.sync(NOW)).toMatchObject({ imported: 0 });
    expect(await VehicleModel.countDocuments({ deletedAt: null })).toBe(0);
  });

  it('adds nothing while the switch is off', async () => {
    insuranceCfg = { importListings: false };
    listings.mockResolvedValue([listing(504956)]);
    expect(await wheelbaseInsuranceService.sync(NOW)).toMatchObject({ imported: 0 });
    expect(await VehicleModel.countDocuments({})).toBe(0);
  });

  it('two servers running at once still make one car', async () => {
    listings.mockResolvedValue([listing(504956)]);
    await Promise.all([wheelbaseInsuranceService.sync(NOW), wheelbaseInsuranceService.sync(NOW)]);
    expect(await VehicleModel.countDocuments({})).toBe(1);
  });
});

describe('booked dates come from Wheelbase', () => {
  it('copies taken days, frees them when Wheelbase does, and leaves other days alone', async () => {
    listings.mockResolvedValue([listing(504956)]);
    blocked.mockResolvedValue([{ from: '2026-12-05', to: '2026-12-07' }, { from: '2026-11-28', to: '2026-12-01' }]);
    await wheelbaseInsuranceService.sync(NOW);
    const car = await carFor(504956);
    await AvailabilityModel.create({ vehicleId: car!._id, dayKey: '2026-12-20', state: 'blocked' });
    await AvailabilityModel.create({ vehicleId: car!._id, dayKey: '2026-12-21', state: 'booked', bookingId: 'wheelbase:9001' });

    const days = async (ref?: string) => (await AvailabilityModel.find({ vehicleId: car!._id, ...(ref ? { bookingId: ref } : {}) }).lean()).map((d) => d.dayKey).sort();
    expect(await days(CALENDAR_REF)).toEqual(['2026-12-01', '2026-12-05', '2026-12-06', '2026-12-07']);
    expect(blocked).toHaveBeenCalledWith(504956, '2026-12-01', '2027-05-30');

    blocked.mockResolvedValue([{ from: '2026-12-06', to: '2026-12-06' }]);
    await wheelbaseInsuranceService.sync(NOW);
    expect(await days()).toEqual(['2026-12-06', '2026-12-20', '2026-12-21']);
  });

  it('keeps the last known days when Wheelbase does not answer for a car', async () => {
    listings.mockResolvedValue([listing(504956)]);
    blocked.mockResolvedValue([{ from: '2026-12-05', to: '2026-12-05' }]);
    await wheelbaseInsuranceService.sync(NOW);
    blocked.mockRejectedValue(new Error('Wheelbase availability 503'));
    expect(await wheelbaseInsuranceService.sync(NOW)).toMatchObject({ calendars: 0, calendarErrors: 1 });
    expect(await AvailabilityModel.countDocuments({ bookingId: CALENDAR_REF })).toBe(1);
  });
});

describe('the schedule', () => {
  it('reads Wheelbase only once the admin-set interval has passed', async () => {
    insuranceCfg = { syncMinutes: 15 };
    listings.mockResolvedValue([]);
    await wheelbaseInsuranceService.syncIfDue(NOW);
    expect(await wheelbaseInsuranceService.syncIfDue(new Date(NOW.getTime() + 10 * 60_000))).toEqual({ skipped: 'not_due' });
    expect(await wheelbaseInsuranceService.syncIfDue(new Date(NOW.getTime() + 16 * 60_000))).toMatchObject({ listings: 0 });
    expect(listings).toHaveBeenCalledTimes(2);
  });
});

describe('reading Wheelbase words', () => {
  it('maps fuel and gearbox names', () => {
    expect(['gas', 'Gasoline', 'electric', 'Plug-in Hybrid', 'diesel', 'rocket'].map(fuelOf)).toEqual(['petrol', 'petrol', 'ev', 'hybrid', 'diesel', undefined]);
    expect(['automatic', 'Auto', 'CVT', 'manual', ''].map(transmissionOf)).toEqual(['automatic', 'automatic', 'automatic', 'manual', undefined]);
  });
});
