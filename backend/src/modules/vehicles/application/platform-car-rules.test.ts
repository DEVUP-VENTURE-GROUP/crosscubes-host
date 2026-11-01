import { syncDailyMileage } from './vehicle.service';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('every car follows the platform rules', () => {
  it('moves each car onto the one cancellation policy and the daily mileage', async () => {
    await VehicleModel.collection.insertMany([
      { _id: 'a' as never, deletedAt: null, listing: { cancellationPolicy: 'strict' }, mileageLimit: { perDayKm: 0 } },
      { _id: 'b' as never, deletedAt: null, listing: { cancellationPolicy: 'moderate' }, mileageLimit: { perDayKm: 322 } },
    ]);
    await syncDailyMileage();
    const cars = await VehicleModel.find().lean();
    expect(cars.map((c) => c.listing.cancellationPolicy)).toEqual(['flexible', 'flexible']);
    expect(cars.map((c) => c.mileageLimit.perDayKm)).toEqual([322, 322]);
  });
});
