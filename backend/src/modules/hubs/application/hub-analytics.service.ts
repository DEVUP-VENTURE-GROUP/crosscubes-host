import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { HubModel, type HubDoc } from '../infrastructure/hub.model';
import { hubService } from './hub.service';

// Same trips the finance report counts as revenue.
const EARNING = ['paid', 'in_progress', 'completed'];
const DAY = 86_400_000;

export interface HubPerformance {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  status: HubDoc['status'];
  trips: number;
  gross: number;
  previousGross: number;
  /** Before each partner's monthly insurance and detailing costs. */
  partnerShare: number;
  holderShare: number;
  hqShare: number;
  holderShareBps: number;
  cars: number;
  listedCars: number;
  partners: number;
  blockers: number;
  documentsExpiringSoon: number;
  licenceExpiresAt?: string;
}

export interface NetworkOverview {
  period: { from: string; to: string };
  totals: { hubs: number; live: number; trips: number; gross: number; previousGross: number; partnerShare: number; holderShare: number; hqShare: number; cars: number; listedCars: number };
  hubs: HubPerformance[];
  monthly: { month: string; byHub: Record<string, number> }[];
  unassigned: { trips: number; gross: number };
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Gross per hub and car for a period; the car level is needed to know which trips belong to a partner. */
async function grossByHubAndCar(from: Date, to: Date) {
  return BookingModel.aggregate<{ _id: { hub: string | null; car: string }; trips: number; gross: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, status: { $in: EARNING } } },
    { $group: { _id: { hub: { $ifNull: ['$hubId', null] }, car: '$vehicleId' }, trips: { $sum: 1 }, gross: { $sum: '$priceBreakdown.total.amount' } } },
  ]).exec();
}

async function countByHub(model: typeof VehicleModel | typeof AssetPartnerModel, match: Record<string, unknown>): Promise<Map<string, number>> {
  const rows = await (model as typeof VehicleModel).aggregate<{ _id: string; n: number }>([{ $match: { ...match, hubId: { $type: 'string' } } }, { $group: { _id: '$hubId', n: { $sum: 1 } } }]).exec();
  return new Map(rows.map((r) => [r._id, r.n]));
}

export class HubAnalyticsService {
  /** Every hub side by side for one period: who earned what, plus six months of gross for the trend. */
  async overview(range: { from: Date; to: Date }, now = new Date()): Promise<NetworkOverview> {
    const { from, to } = range;
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const trendFrom = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1));
    const soon = new Date(now.getTime() + 30 * DAY);

    const [cfg, hubs, current, previous, cars, listed, partners, trendRows] = await Promise.all([
      platformConfigService.get(),
      HubModel.find({ status: { $ne: 'closed' } }).sort({ createdAt: 1 }).lean<HubDoc[]>(),
      grossByHubAndCar(from, to),
      grossByHubAndCar(prevFrom, from),
      countByHub(VehicleModel, { deletedAt: null }),
      countByHub(VehicleModel, { deletedAt: null, status: 'listed' }),
      countByHub(AssetPartnerModel, { status: 'active' }),
      BookingModel.aggregate<{ _id: { hub: string; month: string }; gross: number }>([
        { $match: { createdAt: { $gte: trendFrom, $lt: to }, status: { $in: EARNING }, hubId: { $type: 'string' } } },
        { $group: { _id: { hub: '$hubId', month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } }, gross: { $sum: '$priceBreakdown.total.amount' } } },
      ]).exec(),
    ]);

    // Each partner car keeps gross minus its partner's management fee: their negotiated one, else the platform's.
    const carIds = [...new Set(current.map((r) => r._id.car))];
    const partnerCars = await VehicleModel.find({ _id: { $in: carIds }, assetPartnerId: { $exists: true, $ne: null } }).select('assetPartnerId').lean<{ _id: string; assetPartnerId: string }[]>();
    const feeByPartner = new Map(
      (await AssetPartnerModel.find({ _id: { $in: [...new Set(partnerCars.map((c) => c.assetPartnerId))] } }).select('terms.managementFeeBps').lean<{ _id: string; terms?: { managementFeeBps?: number } }[]>()).map((p) => [
        p._id,
        p.terms?.managementFeeBps ?? cfg.assetPartner.managementFeeBps,
      ]),
    );
    const feeByCar = new Map(partnerCars.map((c) => [c._id, feeByPartner.get(c.assetPartnerId) ?? cfg.assetPartner.managementFeeBps]));

    const byHub = new Map<string | null, { trips: number; gross: number; partnerShare: number }>();
    for (const r of current) {
      const acc = byHub.get(r._id.hub) ?? { trips: 0, gross: 0, partnerShare: 0 };
      acc.trips += r.trips;
      acc.gross += r.gross;
      const fee = feeByCar.get(r._id.car);
      if (fee !== undefined) acc.partnerShare += Math.round((r.gross * (10_000 - fee)) / 10_000);
      byHub.set(r._id.hub, acc);
    }
    const prevGross = new Map<string | null, number>();
    for (const r of previous) prevGross.set(r._id.hub, (prevGross.get(r._id.hub) ?? 0) + r.gross);

    const rows: HubPerformance[] = hubs.map((h) => {
      const cur = byHub.get(h._id) ?? { trips: 0, gross: 0, partnerShare: 0 };
      const holderShareBps = h.economics?.holderShareBps ?? cfg.hubs.holderShareBps;
      const holderShare = Math.round((cur.gross * holderShareBps) / 10_000);
      return {
        id: h._id,
        code: h.code,
        name: h.name,
        city: h.city,
        state: h.state,
        status: h.status,
        trips: cur.trips,
        gross: cur.gross,
        previousGross: prevGross.get(h._id) ?? 0,
        partnerShare: cur.partnerShare,
        holderShare,
        hqShare: cur.gross - cur.partnerShare - holderShare,
        holderShareBps,
        cars: cars.get(h._id) ?? 0,
        listedCars: listed.get(h._id) ?? 0,
        partners: partners.get(h._id) ?? 0,
        blockers: h.status === 'setup' ? hubService.launchBlockers(h, now).length : 0,
        documentsExpiringSoon: (h.documents ?? []).filter((d) => d.expiresAt && d.expiresAt <= soon).length,
        licenceExpiresAt: h.licence?.expiresAt?.toISOString(),
      };
    });

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - i, 1))));
    const monthly = months.map((month) => ({ month, byHub: {} as Record<string, number> }));
    for (const r of trendRows) {
      const m = monthly.find((x) => x.month === r._id.month);
      if (m) m.byHub[r._id.hub] = r.gross;
    }

    const sum = (pick: (r: HubPerformance) => number) => rows.reduce((s, r) => s + pick(r), 0);
    const unassigned = byHub.get(null);
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        hubs: rows.length,
        live: rows.filter((r) => r.status === 'live').length,
        trips: sum((r) => r.trips),
        gross: sum((r) => r.gross),
        previousGross: sum((r) => r.previousGross),
        partnerShare: sum((r) => r.partnerShare),
        holderShare: sum((r) => r.holderShare),
        hqShare: sum((r) => r.hqShare),
        cars: sum((r) => r.cars),
        listedCars: sum((r) => r.listedCars),
      },
      hubs: rows,
      monthly,
      unassigned: { trips: unassigned?.trips ?? 0, gross: unassigned?.gross ?? 0 },
    };
  }
}

export const hubAnalyticsService = new HubAnalyticsService();
