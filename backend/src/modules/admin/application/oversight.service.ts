import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { PayoutModel } from '../../payouts/infrastructure/payout.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { NotFoundError } from '../../../core/errors/app-error';

/**
 * Cross-tenant oversight for the console. Hosts/orgs each see only their own
 * data; staff need the whole picture, so these read across tenants and join in
 * the owner names an operator actually recognises.
 */
export class OversightService {
  /** Reviews for moderation, newest first. */
  async reviews(q: { status?: string; minRating?: number } = {}) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.minRating) filter.rating = { $lte: q.minRating }; // surface the bad ones
    return ReviewModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  }

  async setReviewStatus(reviewId: string, status: 'published' | 'hidden') {
    const review = await ReviewModel.findByIdAndUpdate(reviewId, { status }, { new: true }).lean();
    if (!review) throw new NotFoundError('Review');
    return review;
  }

  /** Payout queue across all hosts — what the platform owes and has paid. */
  async payouts(q: { status?: string } = {}) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    const payouts = await PayoutModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    if (payouts.length === 0) return { rows: [], totals: { scheduled: 0, paid: 0 } };

    const hostIds = [...new Set(payouts.map((p) => p.hostId))];
    const hosts = await HostModel.find({ _id: { $in: hostIds } })
      .select('displayName')
      .lean<{ _id: string; displayName: string }[]>();
    const hostName = new Map(hosts.map((h) => [h._id, h.displayName]));

    const totals = payouts.reduce(
      (acc, p) => {
        if (p.status === 'scheduled') acc.scheduled += p.amount;
        if (p.status === 'paid') acc.paid += p.amount;
        return acc;
      },
      { scheduled: 0, paid: 0 },
    );

    return {
      rows: payouts.map((p) => ({
        _id: p._id,
        hostId: p.hostId,
        hostName: hostName.get(p.hostId) ?? '—',
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        instant: !!p.instant,
        scheduledFor: p.scheduledFor,
        paidAt: p.paidAt ?? null,
      })),
      totals,
    };
  }
}

export const oversightService = new OversightService();
