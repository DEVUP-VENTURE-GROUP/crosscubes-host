import { HubPayoutModel, type HubPayoutDoc, type HubPayoutMethod } from '../infrastructure/hub-payout.model';
import { HubModel, type HubDoc } from '../infrastructure/hub.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const periodOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const monthBounds = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
};
const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export class HubPayoutService {
  /** Writes last month's statement for every hub with a holder, once the payout day has come; safe to run every hour. */
  async run(now = new Date()): Promise<number> {
    const cfg = (await platformConfigService.get()).hubs;
    if (now.getUTCDate() < cfg.payoutDayOfMonth) return 0;
    const period = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const hubs = await HubModel.find({ operatorUserId: { $type: 'string' }, status: { $ne: 'closed' } }).lean<HubDoc[]>();
    let written = 0;
    for (const hub of hubs) {
      if (await HubPayoutModel.exists({ hubId: hub._id, period })) continue;
      try {
        await this.write(hub, period, hub.economics?.holderShareBps ?? cfg.holderShareBps);
        written += 1;
      } catch (err) {
        // Another server wrote it first; the unique index keeps it to one.
        if ((err as { code?: number }).code !== 11000) logger.warn({ hubId: hub._id, period, err: (err as Error).message }, 'hub statement failed');
      }
    }
    return written;
  }

  /** The holder's share of the trips that ended in the month and were completed, the same trips partners are paid on. */
  private async write(hub: HubDoc, period: string, holderShareBps: number): Promise<HubPayoutDoc> {
    const { start, end } = monthBounds(period);
    const [row] = await BookingModel.aggregate<{ trips: number; gross: number }>([
      { $match: { hubId: hub._id, status: 'completed', 'period.end': { $gte: start, $lt: end } } },
      { $group: { _id: null, trips: { $sum: 1 }, gross: { $sum: '$priceBreakdown.subtotal.amount' } } },
    ]).exec();
    const grossCents = row?.gross ?? 0;
    const doc = await HubPayoutModel.create({
      hubId: hub._id,
      period,
      trips: row?.trips ?? 0,
      grossCents,
      holderShareBps,
      amountCents: Math.round((grossCents * holderShareBps) / 10_000),
      // Nothing to pay is settled the moment it is written.
      status: grossCents === 0 ? 'paid' : 'pending',
    });
    if (hub.operatorUserId && doc.amountCents > 0) {
      await notificationService.send({
        userId: hub.operatorUserId,
        templateKey: 'hub.statement_ready',
        title: `Your ${period} statement: ${usd(doc.amountCents)}`,
        body: `${doc.trips} completed trip${doc.trips === 1 ? '' : 's'} in ${hub.name}. HQ pays your share and marks it paid here.`,
        data: { hubId: hub._id, payoutId: doc._id },
      });
    }
    return doc.toObject();
  }

  async forHub(hubId: string): Promise<HubPayoutDoc[]> {
    return HubPayoutModel.find({ hubId }).sort({ period: -1 }).limit(36).lean<HubPayoutDoc[]>();
  }

  async pending(): Promise<(HubPayoutDoc & { hub?: { code: string; name: string } })[]> {
    const rows = await HubPayoutModel.find({ status: 'pending' }).sort({ period: 1 }).limit(200).lean<HubPayoutDoc[]>();
    const hubs = new Map((await HubModel.find({ _id: { $in: [...new Set(rows.map((r) => r.hubId))] } }).select('code name').lean<HubDoc[]>()).map((h) => [h._id, h]));
    return rows.map((r) => ({ ...r, hub: hubs.get(r.hubId) ? { code: hubs.get(r.hubId)!.code, name: hubs.get(r.hubId)!.name } : undefined }));
  }

  async markPaid(id: string, input: { method: HubPayoutMethod; reference?: string }, by: string): Promise<HubPayoutDoc> {
    const updated = await HubPayoutModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'paid', paid: { at: new Date(), by, method: input.method, reference: input.reference?.trim() || undefined } } },
      { new: true },
    ).lean<HubPayoutDoc>();
    if (!updated) throw new ConflictError('This statement is already paid, or doesn’t exist.', 'PAYOUT_STATE');
    const hub = await HubModel.findById(updated.hubId).select('operatorUserId name').lean<{ operatorUserId?: string; name: string }>();
    if (hub?.operatorUserId) {
      await notificationService.send({
        userId: hub.operatorUserId,
        templateKey: 'hub.statement_paid',
        title: `${usd(updated.amountCents)} paid for ${updated.period}`,
        body: `Your ${hub.name} share for ${updated.period} has been sent${updated.paid?.reference ? ` (reference ${updated.paid.reference})` : ''}.`,
        data: { payoutId: updated._id },
      });
    }
    return updated;
  }
}

export const hubPayoutService = new HubPayoutService();
