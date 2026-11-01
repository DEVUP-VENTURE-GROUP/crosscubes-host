jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { hubService, clearLiveHubCache, type HubInput } from './hub.service';
import { hubAnalyticsService } from './hub-analytics.service';
import { HubModel } from '../infrastructure/hub.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { searchService } from '../../search/application/search.service';
import { runInHub } from '../../../shared/tenancy/hub-context';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  clearLiveHubCache();
});

const HOUSTON = { lng: -95.3698, lat: 29.7604 };
const DALLAS = { lng: -96.797, lat: 32.7767 };

const input = (over: Partial<HubInput> = {}): HubInput => ({
  code: 'HOU',
  name: 'Houston',
  city: 'Houston',
  state: 'TX',
  timezone: 'America/Chicago',
  territory: { ...HOUSTON, radiusMiles: 40, exclusive: true },
  franchisee: { legalName: 'Bayou Mobility LLC', contactName: 'Ana Ruiz', email: 'ana@bayou.example' },
  agreement: { termYears: 10 },
  economics: { royaltyPct: 8, techFeePct: 2, marketingFundPct: 2 },
  ...over,
});

const future = () => new Date(Date.now() + 365 * 86_400_000);

async function liveHub(over: Partial<HubInput> = {}) {
  const hub = await hubService.create(input({ agreement: { termYears: 10, signedAt: new Date(), startsAt: new Date() }, ...over }), 'hq');
  await hubService.assignOperator(hub._id, { name: 'Ana Ruiz', email: `${hub.code.toLowerCase()}@bayou.example` }, 'hq');
  await hubService.addLicence(hub._id, { kind: 'insurance', label: 'Fleet policy', expiresAt: future() }, 'hq');
  await hubService.addLicence(hub._id, { kind: 'business_licence', label: 'LLC registration' }, 'hq');
  return hubService.setStatus(hub._id, 'live', 'hq');
}

let carN = 0;
async function car(hubId: string | undefined, at = HOUSTON) {
  carN += 1;
  const host = await HostModel.create({ userId: `u-${carN}`, displayName: `Host ${carN}`, verificationStatus: 'verified' });
  return VehicleModel.create({
    hostId: host._id,
    hubId,
    year: 2024,
    make: 'Toyota',
    model: 'Camry',
    registrationNumber: `TX-${carN}`,
    category: 'sedan',
    status: 'listed',
    verificationStatus: 'verified',
    seats: 5,
    fuelType: 'petrol',
    transmission: 'automatic',
    bodyType: 'sedan',
    listing: { title: 'Camry' },
    pricing: { dailyPrice: 6000, currency: 'USD' },
    location: { type: 'Point', coordinates: [at.lng, at.lat], city: 'Houston', state: 'TX' },
  });
}

describe('franchise hubs', () => {
  it('refuses a territory that overlaps an exclusive hub, but allows a separate city', async () => {
    await hubService.create(input(), 'hq');
    await expect(hubService.create(input({ code: 'KTY', name: 'Katy', territory: { lng: -95.82, lat: 29.79, radiusMiles: 20, exclusive: true } }), 'hq')).rejects.toThrow('overlaps Houston');
    await expect(hubService.create(input({ territory: { ...DALLAS, radiusMiles: 10, exclusive: true } }), 'hq')).rejects.toThrow('already uses that code');
    const dallas = await hubService.create(input({ code: 'DAL', name: 'Dallas', city: 'Dallas', territory: { ...DALLAS, radiusMiles: 40, exclusive: true } }), 'hq');
    expect(dallas.status).toBe('setup');
  });

  it('only goes live once the login, signed agreement, insurance and licence are in place', async () => {
    const hub = await hubService.create(input(), 'hq');
    await expect(hubService.setStatus(hub._id, 'live', 'hq')).rejects.toThrow('Create the franchisee’s login');

    const login = await hubService.assignOperator(hub._id, { name: 'Ana Ruiz', email: 'ana@bayou.example' }, 'hq');
    expect(login.password).toHaveLength(16);
    const operator = await UserModel.findOne({ email: 'ana@bayou.example' }).lean();
    expect(operator?.roles).toEqual(expect.arrayContaining(['host', 'house_fleet']));
    await expect(hubService.assignOperator(hub._id, { name: 'Someone', email: 'x@example.com' }, 'hq')).rejects.toThrow('already has a franchisee login');

    await hubService.update(hub._id, { agreement: { termYears: 10, signedAt: new Date(), startsAt: new Date() } }, 'hq');
    await hubService.addLicence(hub._id, { kind: 'insurance', label: 'Old policy', expiresAt: new Date(Date.now() - 86_400_000) }, 'hq');
    await expect(hubService.setStatus(hub._id, 'live', 'hq')).rejects.toThrow('fleet insurance');
    await hubService.addLicence(hub._id, { kind: 'insurance', label: 'Fleet policy', expiresAt: future() }, 'hq');
    await hubService.addLicence(hub._id, { kind: 'business_licence', label: 'LLC registration' }, 'hq');

    const live = await hubService.setStatus(hub._id, 'live', 'hq');
    expect(live.launchedAt).toBeInstanceOf(Date);
    expect(await hubService.publicList()).toEqual([{ id: hub._id, code: 'HOU', name: 'Houston', city: 'Houston', state: 'TX' }]);
    await expect(hubService.setStatus(hub._id, 'paused', 'hq')).rejects.toThrow('Say why');
    expect((await hubService.setStatus(hub._id, 'paused', 'hq', 'Insurance renewal')).status).toBe('paused');
  });

  it('never makes an HQ staff account a franchisee', async () => {
    const hub = await hubService.create(input(), 'hq');
    await UserModel.create({ email: 'ops@hq.example', roles: ['ops'], status: 'active' });
    await expect(hubService.assignOperator(hub._id, { name: 'Ops', email: 'ops@hq.example' }, 'hq')).rejects.toThrow('HQ staff account');
  });

  it('places a point in the hub whose area holds it, nearest centre first', async () => {
    const hou = await hubService.create(input({ territory: { ...HOUSTON, radiusMiles: 40, exclusive: false } }), 'hq');
    const katy = await hubService.create(input({ code: 'KTY', name: 'Katy', territory: { lng: -95.82, lat: 29.79, radiusMiles: 25, exclusive: false } }), 'hq');
    expect(await hubService.resolveForPoint(HOUSTON.lng, HOUSTON.lat)).toBe(hou._id);
    expect(await hubService.resolveForPoint(-95.8, 29.79)).toBe(katy._id);
    expect(await hubService.resolveForPoint(DALLAS.lng, DALLAS.lat)).toBeUndefined();
  });
});

describe('hub isolation', () => {
  it('a franchisee sees, changes and creates records only in their own hub', async () => {
    const a = await car('hub-a');
    const b = await car('hub-b');

    await runInHub('hub-a', async () => {
      expect((await VehicleModel.find({}).lean()).map((v) => v._id)).toEqual([a._id]);
      expect(await VehicleModel.findById(b._id).lean()).toBeNull();
      expect(await VehicleModel.findOne({ _id: b._id, hubId: 'hub-b' }).lean()).toBeNull();
      expect(await VehicleModel.countDocuments({})).toBe(1);
      expect(await VehicleModel.distinct('_id')).toEqual([a._id]);
      expect((await VehicleModel.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]))[0].n).toBe(1);
      expect((await VehicleModel.updateOne({ _id: b._id }, { $set: { 'listing.title': 'hijacked' } })).modifiedCount).toBe(0);
      expect((await VehicleModel.deleteOne({ _id: b._id })).deletedCount).toBe(0);
      await expect(VehicleModel.updateOne({ _id: a._id }, { $set: { hubId: 'hub-b' } })).rejects.toThrow();
      await expect(car('hub-b')).rejects.toThrow();
      const made = await car(undefined);
      expect(made.hubId).toBe('hub-a');
    });

    expect(await VehicleModel.countDocuments({})).toBe(3);
    expect((await VehicleModel.findById(b._id).lean())?.listing.title).toBe('Camry');
  });
});

describe('HQ network analytics', () => {
  it('adds up each hub’s trips, gross and what it owes HQ, and keeps unplaced trips separate', async () => {
    const hou = await liveHub();
    const dal = await hubService.create(input({ code: 'DAL', name: 'Dallas', city: 'Dallas', territory: { ...DALLAS, radiusMiles: 40, exclusive: true }, economics: { royaltyPct: 6, techFeePct: 2, marketingFundPct: 2 } }), 'hq');
    const now = new Date();
    const from = new Date(now.getTime() - 10 * 86_400_000);
    const trip = (hubId: string | undefined, amount: number, status = 'completed', daysAgo = 2) => ({
      _id: `b-${Math.random()}`,
      code: `C${Math.random()}`,
      hubId,
      status,
      createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
      priceBreakdown: { total: { amount, currency: 'USD' } },
    });
    await BookingModel.collection.insertMany([
      trip(hou._id, 50_000),
      trip(hou._id, 30_000, 'paid'),
      trip(hou._id, 99_000, 'cancelled'),
      trip(hou._id, 20_000, 'completed', 15),
      trip(dal._id, 10_000),
      trip(undefined, 7_000),
    ] as never[]);

    const o = await hubAnalyticsService.overview({ from, to: now }, now);
    const h = o.hubs.find((x) => x.code === 'HOU')!;
    expect(h).toMatchObject({ trips: 2, gmv: 80_000, previousGmv: 20_000, owedToHq: 9_600, feePct: 12, status: 'live' });
    expect(o.hubs.find((x) => x.code === 'DAL')).toMatchObject({ gmv: 10_000, owedToHq: 1_000, blockers: 4 });
    expect(o.totals).toMatchObject({ hubs: 2, live: 1, trips: 3, gmv: 90_000, owedToHq: 10_600 });
    expect(o.unassigned).toEqual({ trips: 1, gmv: 7_000 });
    expect(o.monthly).toHaveLength(6);
  });
});

describe('guests only see cars in live hubs', () => {
  it('hides a car until its hub goes live', async () => {
    await VehicleModel.init();
    const hub = await hubService.create(input({ agreement: { termYears: 10, signedAt: new Date(), startsAt: new Date() } }), 'hq');
    const c = await car(hub._id);
    const search = () => searchService.searchVehicles({ ...HOUSTON, radiusKm: 30 });
    expect(await search()).toHaveLength(0);

    await hubService.assignOperator(hub._id, { name: 'Ana Ruiz', email: 'ana@bayou.example' }, 'hq');
    await hubService.addLicence(hub._id, { kind: 'insurance', label: 'Fleet policy', expiresAt: future() }, 'hq');
    await hubService.addLicence(hub._id, { kind: 'business_licence', label: 'LLC registration' }, 'hq');
    await hubService.setStatus(hub._id, 'live', 'hq');
    expect((await search()).map((v) => v._id)).toEqual([c._id]);
    expect(await HubModel.countDocuments({ status: 'live' })).toBe(1);
  });
});
