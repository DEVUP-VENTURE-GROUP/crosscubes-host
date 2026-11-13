import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../../config';
import { UnauthorizedError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HubModel } from '../../hubs/infrastructure/hub.model';
import { availabilityService } from '../../availability/application/availability.service';
import { notificationService } from '../../notifications/application/notification.service';
import {
  WheelbaseReservationModel,
  type WheelbaseReservationDoc,
  type WheelbaseReservationState,
} from '../infrastructure/wheelbase-reservation.model';

const id = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().regex(/^\d{1,20}$/));
// A bare date is read as midday UTC, which is the same calendar day in every US time zone.
const asDate = (v: string | number) => {
  if (typeof v === 'number') return new Date(v);
  const t = v.trim();
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00Z` : t);
};
const date = z.union([z.string(), z.number()]).transform(asDate).refine((d) => !Number.isNaN(d.getTime()), 'Not a date');
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

// The body the Zapier zap sends: field names CrossCubes chose, mapped once from the Wheelbase trigger.
export const wheelbaseReservationSchema = z
  .object({
    reservationId: id,
    rentalId: id,
    status: z.string().trim().min(1).max(40),
    from: date,
    to: date,
    amount: z.preprocess(blankToUndefined, z.union([z.number(), z.string().trim().regex(/^\$?[\d,]+(\.\d{1,2})?$/)]).optional()),
    currency: z.preprocess(blankToUndefined, z.string().trim().regex(/^[A-Za-z]{3}$/).optional()),
    renterName: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
    updatedAt: z.preprocess(blankToUndefined, date.optional()),
  })
  .refine((b) => b.to.getTime() > b.from.getTime(), { message: 'Return must be after pickup', path: ['to'] });

export type WheelbaseReservationInput = z.infer<typeof wheelbaseReservationSchema>;

/** Wheelbase status words grouped by what they mean for the car's calendar and the money. */
export function reservationState(status: string): WheelbaseReservationState {
  const s = status.toLowerCase();
  if (/cancel|declin|expir|reject|void/.test(s)) return 'cancelled';
  if (/return|complet|finish|closed/.test(s)) return 'completed';
  return 'active';
}

const toCents = (amount: WheelbaseReservationInput['amount']): number | undefined => {
  if (amount === undefined) return undefined;
  const n = typeof amount === 'number' ? amount : Number(amount.replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

const digest = (s: string) => createHash('sha256').update(s).digest();

export const wheelbaseReservationService = {
  /** Constant-time check of the shared secret the zap sends; refuses everything while no secret is configured. */
  assertCaller(provided: string | undefined): void {
    const secret = config.wheelbase.webhookSecret;
    if (!secret || !provided || !timingSafeEqual(digest(provided), digest(secret))) {
      throw new UnauthorizedError('Invalid Wheelbase webhook secret');
    }
  },

  /** Records a new or changed Wheelbase reservation and keeps the car's calendar in step. Safe to receive twice. */
  async ingest(input: WheelbaseReservationInput): Promise<{ reservationId: string; state: WheelbaseReservationState; linked: boolean; ignored?: 'stale' }> {
    const existing = await WheelbaseReservationModel.findById(input.reservationId).lean<WheelbaseReservationDoc>();
    // Zapier can deliver out of order; an older update must not undo a newer one.
    if (existing?.sourceUpdatedAt && input.updatedAt && input.updatedAt < existing.sourceUpdatedAt) {
      return { reservationId: existing._id, state: existing.state, linked: !!existing.vehicleId, ignored: 'stale' };
    }

    const rentalId = Number(input.rentalId);
    const vehicle = await VehicleModel.findOne({ 'wheelbase.rentalId': rentalId, deletedAt: null }).select('_id hubId make model year').lean<{ _id: string; hubId?: string; make?: string; model?: string; year?: number }>();
    const state = reservationState(input.status);
    const amountCents = toCents(input.amount);

    await WheelbaseReservationModel.updateOne(
      { _id: input.reservationId },
      {
        $set: {
          rentalId,
          status: input.status,
          state,
          period: { start: input.from, end: input.to },
          currency: (input.currency ?? existing?.currency ?? 'USD').toUpperCase(),
          ...(vehicle ? { vehicleId: vehicle._id, hubId: vehicle.hubId } : {}),
          ...(amountCents !== undefined ? { amountCents } : {}),
          ...(input.renterName ? { renterName: input.renterName } : {}),
          ...(input.updatedAt ? { sourceUpdatedAt: input.updatedAt } : {}),
        },
      },
      { upsert: true },
    );

    const ref = `wheelbase:${input.reservationId}`;
    if (!vehicle) {
      logger.warn({ reservationId: input.reservationId, rentalId }, 'wheelbase reservation for a listing not linked to any car');
    } else if (state === 'cancelled') {
      await availabilityService.releaseBooking(ref);
    } else {
      await availabilityService.reserveExternal(vehicle._id, input.from, input.to, ref);
    }

    if (vehicle && !existing && state === 'active') await this.tellCity(vehicle, input);
    return { reservationId: input.reservationId, state, linked: !!vehicle };
  },

  async tellCity(vehicle: { hubId?: string; make?: string; model?: string; year?: number }, input: WheelbaseReservationInput): Promise<void> {
    if (!vehicle.hubId) return;
    const hub = await HubModel.findById(vehicle.hubId).select('operatorUserId').lean<{ operatorUserId?: string }>();
    if (!hub?.operatorUserId) return;
    const car = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'A car';
    const day = (d: Date) => d.toISOString().slice(0, 10);
    await notificationService
      .send({
        userId: hub.operatorUserId,
        templateKey: 'hub.wheelbase_booking',
        title: `New Wheelbase booking: ${car}`,
        body: `${day(input.from)} to ${day(input.to)}. Booked and paid through Wheelbase.`,
        data: { reservationId: input.reservationId },
      })
      .catch((err: Error) => logger.warn({ err: err.message }, 'wheelbase booking notice failed'));
  },

  /** A city's Wheelbase reservations (or every city's for HQ), newest pickup first. */
  async list(opts: { hubId?: string; limit?: number } = {}): Promise<WheelbaseReservationDoc[]> {
    return WheelbaseReservationModel.find(opts.hubId ? { hubId: opts.hubId } : {})
      .sort({ 'period.start': -1 })
      .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500))
      .lean<WheelbaseReservationDoc[]>();
  },

  /** Once a listing is linked, its earlier reservations join the car: city, calendar and statements. */
  async attachToVehicle(rentalId: number, vehicleId: string): Promise<number> {
    const car = await VehicleModel.findById(vehicleId).select('hubId').lean<{ hubId?: string }>();
    const rows = await WheelbaseReservationModel.find({ rentalId, vehicleId: { $exists: false } }).lean<WheelbaseReservationDoc[]>();
    for (const r of rows) {
      await WheelbaseReservationModel.updateOne({ _id: r._id }, { $set: { vehicleId, ...(car?.hubId ? { hubId: car.hubId } : {}) } });
      if (r.state !== 'cancelled') await availabilityService.reserveExternal(vehicleId, r.period.start, r.period.end, `wheelbase:${r._id}`);
    }
    return rows.length;
  },

  /** Trips that ended in [start, end) for a city: what its statement counts. */
  async completedTotals(hubId: string, start: Date, end: Date): Promise<{ trips: number; grossCents: number }> {
    const [row] = await WheelbaseReservationModel.aggregate<{ trips: number; gross: number }>([
      // Not every dealer marks a trip returned in Wheelbase, so any uncancelled trip that has ended counts.
      { $match: { hubId, state: { $ne: 'cancelled' }, 'period.end': { $gte: start, $lt: end } } },
      { $group: { _id: null, trips: { $sum: 1 }, gross: { $sum: { $ifNull: ['$amountCents', 0] } } } },
    ]).exec();
    return { trips: row?.trips ?? 0, grossCents: row?.gross ?? 0 };
  },
};
