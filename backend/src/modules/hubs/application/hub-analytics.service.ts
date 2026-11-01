import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { HubModel, type HubDoc } from '../infrastructure/hub.model';
import { hubService } from './hub.service';

// Same trips the finance report counts as revenue.
const EARNING = ['paid', 'in_progress', 'completed'];

export interface HubPerformance {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  status: HubDoc['status'];
  trips: number;
  gmv: number;
  previousGmv: number;
  owedToHq: number;
  feePct: number;
  cars: number;
  listedCars: number;
  partners: number;
  blockers: number;
  licencesExpiringSoon: number;
}

export interface NetworkOverview {
  period: { from: string; to: string };
  totals: { hubs: number; live: number; trips: number; gmv: number; previousGmv: number; owedToHq: number; cars: number; listedCars: number };
  hubs: HubPerformance[];
  monthly: { month: string; byHub: Record<string, number> }[];
  unassigned: { trips: number; gmv: number };
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

async function gmvByHub(from: Date, to: Date): Promise<Map<string | null, { trips: number; gmv: number }>> {
  const rows = await BookingModel.aggregate<{ _id: string | null; trips: number; gmv: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, status: { $in: EARNING } } },
    { $group: { _id: { $ifNull: ['$hubId', null] }, trips: { $sum: 1 }, gmv: { $sum: '$priceBreakdown.total.amount' } } },
  ]).exec();
  return new Map(rows.map((r) => [r._id, { trips: r.trips, gmv: r.gmv }]));
}

async function countByHub(model: typeof VehicleModel | typeof AssetPartnerModel, match: Record<string, unknown>): Promise<Map<string, number>> {
  const rows = await (model as typeof VehicleModel).aggregate<{ _id: string; n: number }>([{ $match: { ...match, hubId: { $type: 'string' } } }, { $group: { _id: '$hubId', n: { $sum: 1 } } }]).exec();
  return new Map(rows.map((r) => [r._id, r.n]));
}

export class HubAnalyticsService {
  /** Every hub side by side for one period, plus the six months before it for the trend. */
  async overview(range: { from: Date; to: Date }, now = new Date()): Promise<NetworkOverview> {
    const { from, to } = range;
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const trendFrom = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1));
    const soon = new Date(now.getTime() + 30 * 86_400_000);

    const [hubs, current, previous, cars, listed, partners, trendRows] = await Promise.all([
      HubModel.find({ status: { $ne: 'closed' } }).sort({ createdAt: 1 }).lean<HubDoc[]>(),
      gmvByHub(from, to),
      gmvByHub(prevFrom, from),
      countByHub(VehicleModel, { deletedAt: null }),
      countByHub(VehicleModel, { deletedAt: null, status: 'listed' }),
      countByHub(AssetPartnerModel, { status: 'active' }),
      BookingModel.aggregate<{ _id: { hub: string; month: string }; gmv: number }>([
        { $match: { createdAt: { $gte: trendFrom, $lt: to }, status: { $in: EARNING }, hubId: { $type: 'string' } } },
        { $group: { _id: { hub: '$hubId', month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } }, gmv: { $sum: '$priceBreakdown.total.amount' } } },
      ]).exec(),
    ]);

    const rows: HubPerformance[] = hubs.map((h) => {
      const cur = current.get(h._id) ?? { trips: 0, gmv: 0 };
      const feePct = h.economics.royaltyPct + h.economics.techFeePct + h.economics.marketingFundPct;
      return {
        id: h._id,
        code: h.code,
        name: h.name,
        city: h.city,
        state: h.state,
        status: h.status,
        trips: cur.trips,
        gmv: cur.gmv,
        previousGmv: previous.get(h._id)?.gmv ?? 0,
        owedToHq: Math.round((cur.gmv * feePct) / 100),
        feePct,
        cars: cars.get(h._id) ?? 0,
        listedCars: listed.get(h._id) ?? 0,
        partners: partners.get(h._id) ?? 0,
        blockers: h.status === 'setup' ? hubService.launchBlockers(h, now).length : 0,
        licencesExpiringSoon: h.licences.filter((l) => l.expiresAt && l.expiresAt <= soon).length,
      };
    });

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - i, 1))));
    const monthly = months.map((month) => ({ month, byHub: {} as Record<string, number> }));
    for (const r of trendRows) {
      const m = monthly.find((x) => x.month === r._id.month);
      if (m) m.byHub[r._id.hub] = r.gmv;
    }

    const sum = (pick: (r: HubPerformance) => number) => rows.reduce((s, r) => s + pick(r), 0);
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        hubs: rows.length,
        live: rows.filter((r) => r.status === 'live').length,
        trips: sum((r) => r.trips),
        gmv: sum((r) => r.gmv),
        previousGmv: sum((r) => r.previousGmv),
        owedToHq: sum((r) => r.owedToHq),
        cars: sum((r) => r.cars),
        listedCars: sum((r) => r.listedCars),
      },
      hubs: rows,
      monthly,
      unassigned: current.get(null) ?? { trips: 0, gmv: 0 },
    };
  }
}

export const hubAnalyticsService = new HubAnalyticsService();
