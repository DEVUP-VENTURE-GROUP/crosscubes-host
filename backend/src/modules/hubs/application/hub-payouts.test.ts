jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { hubPayoutService } from './hub-payout.service';
import { HubModel } from '../infrastructure/hub.model';
import { HubPayoutModel } from '../infrastructure/hub-payout.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const hub = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  code: id.toUpperCase(),
  name: id,
  status: 'live',
  operatorUserId: `op-${id}`,
  economics: {},
  ...extra,
});
const trip = (hubId: string, endISO: string, subtotal: number, status = 'completed') => ({
  _id: `b-${Math.random()}`,
  code: `C${Math.random()}`,
  hubId,
  status,
  period: { start: new Date(new Date(endISO).getTime() - 86_400_000), end: new Date(endISO) },
  priceBreakdown: { subtotal: { amount: subtotal, currency: 'USD' }, total: { amount: subtotal + 1000, currency: 'USD' } },
});

describe('licence holder payouts', () => {
  it('pays each holder their share of last month’s completed trips, once, from the payout day', async () => {
    await HubModel.collection.insertMany([hub('hou'), hub('dal', { economics: { holderShareBps: 1500 } }), hub('aus', { operatorUserId: undefined }), hub('sat', { status: 'closed' })] as never[]);
    await BookingModel.collection.insertMany([
      trip('hou', '2026-10-03T12:00:00Z', 50_000),
      trip('hou', '2026-10-31T23:00:00Z', 30_000),
      trip('hou', '2026-10-20T12:00:00Z', 90_000, 'cancelled'),
      trip('hou', '2026-11-01T01:00:00Z', 70_000),
      trip('dal', '2026-10-10T12:00:00Z', 20_000),
    ] as never[]);

    expect(await hubPayoutService.run(new Date('2026-11-04T12:00:00Z'))).toBe(0);
    expect(await hubPayoutService.run(new Date('2026-11-05T12:00:00Z'))).toBe(2);
    expect(await hubPayoutService.run(new Date('2026-11-06T12:00:00Z'))).toBe(0);

    const hou = await HubPayoutModel.findOne({ hubId: 'hou' }).lean();
    expect(hou).toMatchObject({ period: '2026-10', trips: 2, grossCents: 80_000, holderShareBps: 1000, amountCents: 8_000, status: 'pending' });
    expect(await HubPayoutModel.findOne({ hubId: 'dal' }).lean()).toMatchObject({ amountCents: 3_000, holderShareBps: 1500 });

    const paid = await hubPayoutService.markPaid(hou!._id, { method: 'zelle', reference: 'ZL-778' }, 'finance-1');
    expect(paid).toMatchObject({ status: 'paid', paid: { method: 'zelle', reference: 'ZL-778', by: 'finance-1' } });
    await expect(hubPayoutService.markPaid(hou!._id, { method: 'zelle' }, 'finance-1')).rejects.toThrow('already paid');
    expect((await hubPayoutService.pending()).map((p) => p.hubId)).toEqual(['dal']);
  });

  it('settles a month with no trips straight away', async () => {
    await HubModel.collection.insertOne(hub('hou') as never);
    await hubPayoutService.run(new Date('2026-11-05T12:00:00Z'));
    expect(await HubPayoutModel.findOne({ hubId: 'hou' }).lean()).toMatchObject({ amountCents: 0, status: 'paid' });
  });
});
