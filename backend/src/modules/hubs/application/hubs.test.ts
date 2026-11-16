jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { hubService, clearLiveHubCache, type HubInput } from './hub.service';
import { hubAnalyticsService } from './hub-analytics.service';
import { HubModel } from '../infrastructure/hub.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { searchService } from '../../search/application/search.service';
import { notificationService } from '../../notifications/application/notification.service';
import { runInHub } from '../../../shared/tenancy/hub-context';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  clearLiveHubCache();
  jest.clearAllMocks();
});

const HOUSTON = { lng: -95.3698, lat: 29.7604 };
const DALLAS = { lng: -96.797, lat: 32.7767 };
const DAY = 86_400_000;

const input = (over: Partial<HubInput> = {}): HubInput => ({
  code: 'HOU',
  name: 'Houston',
  city: 'Houston',
  state: 'TX',
  timezone: 'America/Chicago',
  territory: { ...HOUSTON, radiusMiles: 40, exclusive: true },
  holder: { legalName: 'Bayou Mobility LLC', contactName: 'Ana Ruiz', email: 'ana@bayou.example' },
  ...over,
});

const future = () => new Date(Date.now() + 3 * 365 * DAY);

async function readyHub(over: Partial<HubInput> = {}) {
  const hub = await hubService.create(input(over), 'hq');
  await hubService.assignOperator(hub._id, { name: 'Ana Ruiz', email: `${hub.code.toLowerCase()}@bayou.example` }, 'hq');
  await hubService.recordLicencePayment(hub._id, { reference: 'WIRE-1' }, 'hq');
  await hubService.addDocument(hub._id, { kind: 'insurance', label: 'Fleet policy', expiresAt: future() }, 'hq');
  await hubService.addDocument(hub._id, { kind: 'business_licence', label: 'LLC registration' }, 'hq');
  return hub;
}
const liveHub = async (over: Partial<HubInput> = {}) => hubService.setStatus((await readyHub(over))._id, 'live', 'hq');

let carN = 0;
async function car(hubId: string | undefined, at = HOUSTON, extra: Record<string, unknown> = {}) {
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
    ...extra,
  });
}

describe('city hubs', () => {
  it('refuses a territory that overlaps an exclusive hub, but allows a separate city', async () => {
    await hubService.create(input(), 'hq');
    await expect(hubService.create(input({ code: 'KTY', name: 'Katy', territory: { lng: -95.82, lat: 29.79, radiusMiles: 20, exclusive: true } }), 'hq')).rejects.toThrow('overlaps Houston');
    await expect(hubService.create(input({ territory: { ...DALLAS, radiusMiles: 10, exclusive: true } }), 'hq')).rejects.toThrow('already uses that code');
    const dallas = await hubService.create(input({ code: 'DAL', name: 'Dallas', city: 'Dallas', territory: { ...DALLAS, radiusMiles: 40, exclusive: true } }), 'hq');
    expect(dallas.status).toBe('setup');
  });

  it('only goes live once the login, a paid licence, insurance and business licence are in place', async () => {
    const hub = await hubService.create(input(), 'hq');
    await expect(hubService.setStatus(hub._id, 'live', 'hq')).rejects.toThrow('licence holder’s login');

    const login = await hubService.assignOperator(hub._id, { name: 'Ana Ruiz', email: 'ana@bayou.example' }, 'hq');
    expect(login.password).toHaveLength(16);
    expect((await UserModel.findOne({ email: 'ana@bayou.example' }).lean())?.roles).toEqual(expect.arrayContaining(['host', 'house_fleet']));
    await expect(hubService.assignOperator(hub._id, { name: 'Someone', email: 'x@example.com' }, 'hq')).rejects.toThrow('already has a licence holder login');
    await expect(hubService.setStatus(hub._id, 'live', 'hq')).rejects.toThrow('Record the licence payment');

    await hubService.recordLicencePayment(hub._id, {}, 'hq');
    await hubService.addDocument(hub._id, { kind: 'insurance', label: 'Old policy', expiresAt: new Date(Date.now() - DAY) }, 'hq');
    await expect(hubService.setStatus(hub._id, 'live', 'hq')).rejects.toThrow('fleet insurance');
    await hubService.addDocument(hub._id, { kind: 'insurance', label: 'Fleet policy', expiresAt: future() }, 'hq');
    await hubService.addDocument(hub._id, { kind: 'business_licence', label: 'LLC registration' }, 'hq');

    const live = await hubService.setStatus(hub._id, 'live', 'hq');
    expect(live.launchedAt).toBeInstanceOf(Date);
    expect(await hubService.publicList()).toEqual([{ id: hub._id, code: 'HOU', name: 'Houston', city: 'Houston', state: 'TX' }]);
    await expect(hubService.setStatus(hub._id, 'paused', 'hq')).rejects.toThrow('Say why');
  });

  it('a licence runs 12 months at the configured price, and an early renewal starts when the current one ends', async () => {
    const hub = await hubService.create(input(), 'hq');
    const now = new Date('2026-11-02T00:00:00Z');
    const first = await hubService.recordLicencePayment(hub._id, { reference: 'WIRE-1' }, 'hq', now);
    expect(first.licence.expiresAt).toEqual(new Date('2027-11-02T00:00:00Z'));
    expect(first.licence.terms[0]).toMatchObject({ feeCents: 100_000, reference: 'WIRE-1' });

    const renewed = await hubService.recordLicencePayment(hub._id, {}, 'hq', new Date('2027-10-01T00:00:00Z'));
    expect(renewed.licence.expiresAt).toEqual(new Date('2028-11-02T00:00:00Z'));
    expect(renewed.licence.startsAt).toEqual(now);
    expect(renewed.licence.terms).toHaveLength(2);
  });

  it('pauses a live hub when its licence runs out, reminds the holder before, and resumes when it is renewed', async () => {
    const hub = await liveHub();
    const expiry = (await hubService.get(hub._id)).licence.expiresAt!;

    const early = await hubService.sweepLicences(new Date(expiry.getTime() - 10 * DAY));
    expect(early).toEqual({ paused: 0, reminded: 1 });
    expect((await hubService.sweepLicences(new Date(expiry.getTime() - 9 * DAY))).reminded).toBe(0);

    const after = new Date(expiry.getTime() + DAY);
    expect((await hubService.sweepLicences(after)).paused).toBe(1);
    expect((await hubService.get(hub._id)).status).toBe('paused');
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'hub.licence_expired' }));

    const back = await hubService.recordLicencePayment(hub._id, {}, 'hq', after);
    expect(back.status).toBe('live');
  });

  it('names the city operator CrossCubes plus the city, which is what guests see on its cars', async () => {
    const hub = await hubService.create(input(), 'hq');
    await hubService.assignOperator(hub._id, { name: 'Ana Ruiz', email: 'ana.op@bayou.example' }, 'hq');
    const user = await UserModel.findOne({ email: 'ana.op@bayou.example' }).lean<{ _id: string }>();
    expect((await HostModel.findOne({ userId: user!._id }).lean<{ displayName: string }>())?.displayName).toBe('CrossCubes Houston');
  });

  it('never makes an HQ staff account a licence holder', async () => {
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

describe('hub delivery spots', () => {
  const AIRPORT = { kind: 'airport' as const, name: 'George Bush Intercontinental', address: '2800 N Terminal Rd, Houston, TX', lat: 29.99, lng: -95.34, fee: 5500, minTripDays: 2, accessMethod: 'in_person' as const };

  it('saves the hub’s priced places, hands them to new cars there, and refuses a closed hub', async () => {
    const hub = await hubService.create(input(), 'hq');
    expect(await hubService.deliveryLocationsFor(hub._id)).toBeUndefined();

    const saved = await hubService.setDeliverySpots(hub._id, [AIRPORT], 'hq');
    expect(saved.deliverySpots).toEqual([AIRPORT]);
    expect(saved.timeline.at(-1)).toMatchObject({ event: 'delivery_spots', note: '1 spot' });
    expect(await hubService.deliveryLocationsFor(hub._id)).toEqual([{ ...AIRPORT, enabled: true }]);

    await hubService.setDeliverySpots(hub._id, [], 'hq');
    expect(await hubService.deliveryLocationsFor(hub._id)).toBeUndefined();

    await HubModel.updateOne({ _id: hub._id }, { status: 'closed' });
    await expect(hubService.setDeliverySpots(hub._id, [AIRPORT], 'hq')).rejects.toThrow('not found');
  });
});

describe('hub isolation', () => {
  it('a holder sees, changes and creates records only in their own hub', async () => {
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
  it('splits each hub’s gross between partners, the licence holder and HQ, and keeps unplaced trips separate', async () => {
    const hou = await liveHub();
    const dal = await hubService.create(input({ code: 'DAL', name: 'Dallas', city: 'Dallas', territory: { ...DALLAS, radiusMiles: 40, exclusive: true }, economics: { holderShareBps: 1500 } }), 'hq');
    await AssetPartnerModel.collection.insertMany([
      { _id: 'p-std' as never, userId: 'u-std', status: 'active', hubId: hou._id, terms: {} },
      { _id: 'p-30' as never, userId: 'u-30', status: 'active', hubId: hou._id, terms: { managementFeeBps: 3000 } },
    ]);
    const std = await car(hou._id, HOUSTON, { assetPartnerId: 'p-std' });
    const negotiated = await car(hou._id, HOUSTON, { assetPartnerId: 'p-30' });
    const own = await car(hou._id);

    const now = new Date();
    const from = new Date(now.getTime() - 10 * DAY);
    const trip = (hubId: string | undefined, vehicleId: string, amount: number, status = 'completed', daysAgo = 2) => ({
      _id: `b-${Math.random()}`,
      code: `C${Math.random()}`,
      hubId,
      vehicleId,
      status,
      createdAt: new Date(now.getTime() - daysAgo * DAY),
      priceBreakdown: { subtotal: { amount, currency: 'USD' }, total: { amount: amount + 999, currency: 'USD' } },
    });
    await BookingModel.collection.insertMany([
      trip(hou._id, std._id, 50_000),
      trip(hou._id, negotiated._id, 30_000, 'paid'),
      trip(hou._id, own._id, 20_000),
      trip(hou._id, std._id, 99_000, 'cancelled'),
      trip(hou._id, std._id, 40_000, 'completed', 15),
      trip(dal._id, 'x', 10_000),
      trip(undefined, 'y', 7_000),
    ] as never[]);

    const o = await hubAnalyticsService.overview({ from, to: now }, now);
    // Partners keep 80% and 70%; the holder gets 10% of all 1,000.00; HQ keeps the rest.
    expect(o.hubs.find((x) => x.code === 'HOU')).toMatchObject({ trips: 3, gross: 100_000, previousGross: 40_000, partnerShare: 61_000, holderShare: 10_000, hqShare: 29_000, holderShareBps: 1000, status: 'live' });
    expect(o.hubs.find((x) => x.code === 'DAL')).toMatchObject({ gross: 10_000, holderShare: 1_500, hqShare: 8_500, blockers: 4 });
    expect(o.totals).toMatchObject({ hubs: 2, live: 1, trips: 4, gross: 110_000, partnerShare: 61_000, holderShare: 11_500, hqShare: 37_500 });
    expect(o.unassigned).toEqual({ trips: 1, gross: 7_000 });
    expect(o.monthly).toHaveLength(6);
  });
});

describe('guests only see cars in live hubs', () => {
  it('hides a car until its hub goes live', async () => {
    await VehicleModel.init();
    const hub = await readyHub();
    // Insured, as every car guests can see must be.
    const c = await car(hub._id, HOUSTON, { wheelbase: { rentalId: 1, name: 'Camry', linkedBy: 'admin', insuranceState: 'approved', found: true, syncedAt: new Date() } });
    const search = () => searchService.searchVehicles({ ...HOUSTON, radiusKm: 30 });
    expect(await search()).toHaveLength(0);
    await hubService.setStatus(hub._id, 'live', 'hq');
    expect((await search()).map((v) => v._id)).toEqual([c._id]);
    expect(await HubModel.countDocuments({ status: 'live' })).toBe(1);
  });
});
