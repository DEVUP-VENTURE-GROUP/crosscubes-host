import { VehicleModel, type VehicleDoc, type WheelbaseLink } from '../../vehicles/infrastructure/vehicle.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ageInYears } from '../../users/domain/profile-completion';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import { fetchBlockedRanges, fetchDealerListings, type WheelbaseListing } from '../infrastructure/wheelbase.client';
import { WheelbaseSyncStateModel, type WheelbaseSyncStateDoc } from '../infrastructure/wheelbase-sync-state.model';
import { HubModel, type HubDoc } from '../../hubs/infrastructure/hub.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import type { BookingStatus } from '../../bookings/domain/booking-status';
import { wheelbaseReservationService } from './wheelbase-reservation.service';
import { importListing, importedContent } from './wheelbase-listing-import';
import { WheelbaseImportModel } from '../infrastructure/wheelbase-import.model';
import { availabilityService, dayKeys } from '../../availability/application/availability.service';

const HOUR = 3_600_000;
const CLAIM_MS = 10 * 60_000;
const MAX_SKIPPED = 50;
const CALENDAR_CONCURRENCY = 4;
/** Availability rows owned by the Wheelbase calendar copy, kept apart from single reservations sent by Zapier. */
export const CALENDAR_REF = 'wheelbase:calendar';
/** Our own state for a listing gone from the account past the grace window; Wheelbase never sends it. */
export const MISSING_STATE = 'missing';
const UPCOMING: BookingStatus[] = ['pending_verification', 'pending_payment', 'pending_approval', 'confirmed', 'paid'];

export type InsuranceStatus = 'approved' | 'not_approved' | 'not_linked' | 'missing';

/** One label for every screen: HQ, the city panel and the car checklist read the same rule. */
export function insuranceStatusOf(wb?: WheelbaseLink | null): InsuranceStatus {
  if (!wb?.rentalId) return 'not_linked';
  if (wb.insuranceState === MISSING_STATE || wb.found === false) return 'missing';
  return wb.insuranceState === 'approved' ? 'approved' : 'not_approved';
}

/** The booking rule, shared by checkout, pickup, search and the car page. */
export function isInsuredForBooking(wb: WheelbaseLink | null | undefined, requireApproved: boolean): boolean {
  return !requireApproved || wb?.insuranceState === 'approved';
}

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Same year and make, and one model name starts with the other ("Traverse" / "Traverse FWD Premier"). */
export function sameCar(v: Pick<VehicleDoc, 'year' | 'make' | 'model'>, l: Pick<WheelbaseListing, 'year' | 'make' | 'model'>): boolean {
  if (!l.year || l.year !== v.year || norm(l.make) !== norm(v.make)) return false;
  const a = norm(v.model);
  const b = norm(l.model);
  return !!a && !!b && (a.startsWith(b) || b.startsWith(a));
}

export function linkFrom(l: WheelbaseListing, linkedBy: WheelbaseLink['linkedBy']): WheelbaseLink {
  return {
    rentalId: l.id,
    name: l.name,
    linkedBy,
    insuranceState: l.insuranceState,
    coverage: l.coverage,
    eligible: l.eligible,
    planLabel: l.planLabel,
    minRenterAge: l.minRenterAge,
    found: true,
    syncedAt: new Date(),
  };
}

export interface WheelbaseSyncResult {
  listings: number;
  updated: number;
  autoLinked: number;
  unmatched: number;
  missing: number;
  /** Missing past the grace window, so no longer bookable. */
  lapsed: number;
  /** Listings turned into CrossCubes cars on this run. */
  imported: number;
  /** Listings that could not become cars yet, and why. */
  skipped: { rentalId: number; name: string; reason: string }[];
  /** Cars whose booked dates were copied from Wheelbase, and those Wheelbase would not answer for. */
  calendars: number;
  calendarErrors: number;
}

export type WheelbaseSyncOutcome = WheelbaseSyncResult | { skipped: 'no_dealer' } | { error: 'unreachable' };

const saveState = (set: Partial<WheelbaseSyncStateDoc>, unset: (keyof WheelbaseSyncStateDoc)[] = []) =>
  WheelbaseSyncStateModel.updateOne(
    { _id: 'wheelbase' },
    { $set: set, ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, 1])) } : {}) },
    { upsert: true },
  );

export const wheelbaseInsuranceService = {
  async dealerId(): Promise<string> {
    return (await platformConfigService.get()).insurance.wheelbaseDealerId.trim();
  },

  /**
   * Reads the dealer's Wheelbase listings and refreshes every linked car. Links an unlinked car only when
   * auto-linking is on and exactly one listing matches. A Wheelbase outage leaves every car's last known state.
   */
  async sync(now = new Date()): Promise<WheelbaseSyncOutcome> {
    const { insurance: cfg } = await platformConfigService.get();
    const dealer = cfg.wheelbaseDealerId.trim();
    if (!dealer) {
      await saveState({ lastRunAt: now, lastError: 'not_set_up' });
      return { skipped: 'no_dealer' };
    }
    let listings: WheelbaseListing[];
    try {
      listings = await fetchDealerListings(dealer);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'wheelbase listings fetch failed');
      await this.recordOutage(now, cfg.staleAlertHours);
      return { error: 'unreachable' };
    }
    const byId = new Map(listings.map((l) => [l.id, l]));
    const cars = await VehicleModel.find({ deletedAt: null }).lean<VehicleDoc[]>();
    const graceMs = cfg.missingGraceHours * HOUR;

    const out: WheelbaseSyncResult = { listings: listings.length, updated: 0, autoLinked: 0, unmatched: 0, missing: 0, lapsed: 0, imported: 0, skipped: [], calendars: 0, calendarErrors: 0 };

    for (const car of cars) {
      const current = car.wheelbase;
      if (current?.rentalId) {
        const l = byId.get(current.rentalId);
        if (!l) {
          // Gone from the account: keep the last reading for the grace window, then stop the car being booked.
          const since = current.missingSince ? new Date(current.missingSince) : now;
          const $set: Record<string, unknown> = { 'wheelbase.found': false, 'wheelbase.missingSince': since, 'wheelbase.syncedAt': now };
          if (now.getTime() - since.getTime() >= graceMs && current.insuranceState !== MISSING_STATE) {
            $set['wheelbase.insuranceState'] = MISSING_STATE;
            if (current.insuranceState === 'approved') {
              emit(EVENTS.INSURANCE_STATUS_CHANGED, car._id, { vehicleId: car._id, from: current.insuranceState, to: MISSING_STATE, name: current.name });
            }
            out.lapsed += 1;
          }
          await VehicleModel.updateOne({ _id: car._id }, { $set });
          out.missing += 1;
          continue;
        }
        const next = linkFrom(l, current.linkedBy);
        if (current.insuranceState === 'approved' && next.insuranceState !== 'approved') {
          emit(EVENTS.INSURANCE_STATUS_CHANGED, car._id, { vehicleId: car._id, from: current.insuranceState, to: next.insuranceState ?? 'unknown', name: l.name });
        }
        await VehicleModel.updateOne({ _id: car._id }, { $set: { wheelbase: next, ...(current.linkedBy === 'import' ? importedContent(car, l) : {}) } });
        out.updated += 1;
        continue;
      }
      if (!cfg.autoLink) {
        out.unmatched += 1;
        continue;
      }
      // A Wheelbase listing covers every identical car in its group, so several cars may share one.
      const candidates = listings.filter((l) => sameCar(car, l));
      if (candidates.length === 1) {
        await VehicleModel.updateOne({ _id: car._id }, { $set: { wheelbase: linkFrom(candidates[0], 'auto') } });
        out.autoLinked += 1;
      } else {
        out.unmatched += 1;
      }
    }
    if (cfg.importListings) await this.importNew(listings, now, out);
    await this.syncCalendars(now, cfg.calendarDays, out);
    await saveState({ lastRunAt: now, lastOkAt: now, lastResult: out }, ['lastError', 'staleAlertedAt']);
    logger.info({ ...out, skipped: out.skipped.length }, 'wheelbase sync');
    return out;
  },

  /** Runs the sync when the admin-set interval has passed since the last run; the job asks every few minutes. */
  async syncIfDue(now = new Date()): Promise<WheelbaseSyncOutcome | { skipped: 'not_due' }> {
    const [{ insurance }, state] = await Promise.all([platformConfigService.get(), WheelbaseSyncStateModel.findById('wheelbase').select('lastRunAt').lean<WheelbaseSyncStateDoc>()]);
    const last = state?.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
    if (now.getTime() - last < insurance.syncMinutes * 60_000) return { skipped: 'not_due' };
    return this.sync(now);
  },

  /** Every listing no car is linked to becomes a car, once; a deleted car's listing is never brought back. */
  async importNew(listings: WheelbaseListing[], now: Date, out: WheelbaseSyncResult): Promise<void> {
    const linked = new Set<number>(await VehicleModel.distinct('wheelbase.rentalId', { deletedAt: null }));
    const done = new Set<number>(await WheelbaseImportModel.distinct('_id', { vehicleId: { $exists: true } }));
    await WheelbaseImportModel.deleteMany({ vehicleId: { $exists: false }, claimedAt: { $lt: new Date(now.getTime() - CLAIM_MS) } });
    for (const l of listings) {
      if (linked.has(l.id) || done.has(l.id)) continue;
      try {
        await WheelbaseImportModel.create({ _id: l.id, claimedAt: now });
      } catch {
        continue;
      }
      try {
        const r = await importListing(l, linkFrom(l, 'import'));
        if ('vehicleId' in r) {
          await WheelbaseImportModel.updateOne({ _id: l.id }, { $set: { vehicleId: r.vehicleId } });
          await wheelbaseReservationService.attachToVehicle(l.id, r.vehicleId);
          out.imported += 1;
          continue;
        }
        if (out.skipped.length < MAX_SKIPPED) out.skipped.push({ rentalId: l.id, name: l.name, reason: r.skip });
      } catch (err) {
        logger.warn({ rentalId: l.id, err: (err as Error).message }, 'wheelbase listing import failed');
        if (out.skipped.length < MAX_SKIPPED) out.skipped.push({ rentalId: l.id, name: l.name, reason: 'Could not be added; it will be tried again' });
      }
      await WheelbaseImportModel.deleteOne({ _id: l.id, vehicleId: { $exists: false } });
    }
  },

  /** Copies each linked car's taken dates from Wheelbase, so search and the city calendar match what Wheelbase will sell. */
  async syncCalendars(now: Date, days: number, out: WheelbaseSyncResult): Promise<void> {
    const cars = await VehicleModel.find({ deletedAt: null, 'wheelbase.rentalId': { $exists: true } }).select('_id wheelbase.rentalId').lean<{ _id: string; wheelbase: { rentalId: number } }[]>();
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    let next = 0;
    const worker = async () => {
      while (next < cars.length) {
        const car = cars[next++];
        try {
          const ranges = await fetchBlockedRanges(car.wheelbase.rentalId, from, to);
          const keys = new Set<string>();
          for (const r of ranges) for (const k of dayKeys(new Date(`${r.from}T00:00:00Z`), new Date(`${r.to}T00:00:00Z`))) if (k >= from) keys.add(k);
          await availabilityService.syncExternalDays(car._id, [...keys], CALENDAR_REF);
          out.calendars += 1;
        } catch (err) {
          out.calendarErrors += 1;
          logger.warn({ vehicleId: car._id, err: (err as Error).message }, 'wheelbase calendar read failed');
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CALENDAR_CONCURRENCY, cars.length) }, worker));
  },

  /** Records a failed read and alerts staff once, when the last good read is older than they allow. */
  async recordOutage(now: Date, staleAlertHours: number): Promise<void> {
    const state = await WheelbaseSyncStateModel.findById('wheelbase').lean<WheelbaseSyncStateDoc>();
    const lastOk = state?.lastOkAt ? new Date(state.lastOkAt).getTime() : 0;
    const alert = now.getTime() - lastOk >= staleAlertHours * HOUR && !state?.staleAlertedAt;
    await saveState({ lastRunAt: now, lastError: 'unreachable', ...(alert ? { staleAlertedAt: now } : {}) });
    if (alert) emit(EVENTS.INSURANCE_SYNC_STALE, 'wheelbase', { lastOkAt: state?.lastOkAt ?? null, hours: staleAlertHours });
  },

  /** Every car with its city, link and status, plus the dealer's listings to link to, for the HQ page. */
  async overview(filter: { hubId?: string } = {}) {
    const { insurance: cfg } = await platformConfigService.get();
    const dealer = cfg.wheelbaseDealerId.trim();
    const [cars, sync] = await Promise.all([
      VehicleModel.find({ deletedAt: null, ...(filter.hubId ? { hubId: filter.hubId } : {}) })
        .select('make model year registrationNumber status wheelbase photos hubId')
        .sort({ make: 1, model: 1 })
        .limit(2000)
        .lean<VehicleDoc[]>(),
      WheelbaseSyncStateModel.findById('wheelbase').lean<WheelbaseSyncStateDoc>(),
    ]);
    const hubIds = [...new Set(cars.map((c) => c.hubId).filter((h): h is string => !!h))];
    const hubs = new Map((await HubModel.find({ _id: { $in: hubIds } }).select('code name').lean<HubDoc[]>()).map((h) => [h._id, h]));
    let listings: WheelbaseListing[] = [];
    let error: string | undefined;
    if (dealer) {
      try {
        listings = await fetchDealerListings(dealer);
      } catch (err) {
        error = 'Wheelbase could not be reached just now. Showing the last known insurance for each car.';
        logger.warn({ err: (err as Error).message }, 'wheelbase listings fetch failed');
      }
    }
    return {
      dealerId: dealer,
      settings: {
        requireApproved: cfg.requireApproved,
        enforceMinAge: cfg.enforceMinAge,
        autoLink: cfg.autoLink,
        importListings: cfg.importListings,
        syncMinutes: cfg.syncMinutes,
        calendarDays: cfg.calendarDays,
        missingGraceHours: cfg.missingGraceHours,
        staleAlertHours: cfg.staleAlertHours,
      },
      sync: sync ? { lastRunAt: sync.lastRunAt, lastOkAt: sync.lastOkAt, lastError: sync.lastError, lastResult: sync.lastResult } : null,
      error,
      listings: listings.map((l) => ({ id: l.id, name: l.name, year: l.year, make: l.make, model: l.model, insuranceState: l.insuranceState, planLabel: l.planLabel, minRenterAge: l.minRenterAge })),
      cars: cars.map((c) => {
        const hub = c.hubId ? hubs.get(c.hubId) : undefined;
        return {
          _id: c._id,
          name: `${c.year} ${c.make} ${c.model}`,
          plate: c.registrationNumber,
          status: c.status,
          photoUrl: c.photos?.[0]?.url,
          hub: hub ? { id: hub._id, code: hub.code, name: hub.name } : null,
          insurance: insuranceStatusOf(c.wheelbase),
          bookable: isInsuredForBooking(c.wheelbase, cfg.requireApproved),
          wheelbase: c.wheelbase ?? null,
          suggestions: c.wheelbase ? [] : listings.filter((l) => sameCar(c, l)).map((l) => l.id),
        };
      }),
    };
  },

  /** A city's own cars and their insurance, for the licence holder; called inside the city's scope. */
  async forHub(hubId: string) {
    const { insurance: cfg } = await platformConfigService.get();
    const [cars, sync] = await Promise.all([
      VehicleModel.find({ hubId, deletedAt: null })
        .select('make model year registrationNumber status wheelbase photos')
        .sort({ make: 1, model: 1 })
        .limit(500)
        .lean<VehicleDoc[]>(),
      WheelbaseSyncStateModel.findById('wheelbase').select('lastOkAt').lean<Pick<WheelbaseSyncStateDoc, 'lastOkAt'>>(),
    ]);
    return {
      requireApproved: cfg.requireApproved,
      checkedAt: sync?.lastOkAt ?? null,
      cars: cars.map((c) => ({
        id: c._id,
        name: `${c.year} ${c.make} ${c.model}`,
        plate: c.registrationNumber,
        status: c.status,
        photoUrl: c.photos?.[0]?.url,
        insurance: insuranceStatusOf(c.wheelbase),
        bookable: isInsuredForBooking(c.wheelbase, cfg.requireApproved),
        planLabel: c.wheelbase?.planLabel,
        minRenterAge: c.wheelbase?.minRenterAge,
      })),
    };
  },

  /** Trips not started yet on a car, so staff can move them before pickup. */
  async upcomingTrips(vehicleId: string, now = new Date()) {
    return BookingModel.find({ vehicleId, status: { $in: UPCOMING }, 'period.start': { $gt: now } })
      .select('code hubId period')
      .sort({ 'period.start': 1 })
      .limit(50)
      .lean<{ _id: string; code: string; hubId?: string; period: { start: Date } }[]>();
  },

  /** An admin ties a car to a Wheelbase listing (or clears it); the listing must be in the dealer's account. */
  async link(vehicleId: string, rentalId: number | null): Promise<void> {
    const car = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!car) throw new NotFoundError('Vehicle');
    if (rentalId === null) {
      await VehicleModel.updateOne({ _id: vehicleId }, { $unset: { wheelbase: 1 } });
      return;
    }
    const dealer = await this.dealerId();
    if (!dealer) throw new ValidationError('Set the Wheelbase dealer ID first.');
    const listing = (await fetchDealerListings(dealer)).find((l) => l.id === rentalId);
    if (!listing) throw new ValidationError('That listing is not in this Wheelbase account.');
    await VehicleModel.updateOne({ _id: vehicleId }, { $set: { wheelbase: linkFrom(listing, 'admin') } });
    await wheelbaseReservationService.attachToVehicle(rentalId, vehicleId);
  },

  /** Added to every guest-facing car query so guests only see cars the booking rule would accept. */
  async guestVisibleFilter(): Promise<Record<string, unknown>> {
    const { insurance } = await platformConfigService.get();
    return insurance.requireApproved ? { 'wheelbase.insuranceState': 'approved' } : {};
  },

  /**
   * The insurance rules at booking and at handover: the car must be approved (when required) and the
   * driver old enough for its cover, by the verified ID's date of birth or else the profile's, at pickup.
   */
  async assertInsurable(vehicleId: string, guestId: string, pickupAt: Date): Promise<void> {
    const { insurance } = await platformConfigService.get();
    const car = await VehicleModel.findById(vehicleId).select('wheelbase').lean<Pick<VehicleDoc, 'wheelbase'>>();
    const wb = car?.wheelbase;

    if (!isInsuredForBooking(wb, insurance.requireApproved)) {
      throw new ConflictError('This car isn’t available to book right now. Please choose another car.', 'INSURANCE_NOT_APPROVED');
    }
    const minAge = wb?.minRenterAge;
    if (insurance.enforceMinAge && minAge) {
      const [kyc, user] = await Promise.all([
        KycModel.findOne({ userId: guestId }).select('verifiedDob').lean<{ verifiedDob?: Date }>(),
        UserModel.findById(guestId).select('dateOfBirth').lean<{ dateOfBirth?: string }>(),
      ]);
      const age = ageInYears(kyc?.verifiedDob ?? user?.dateOfBirth, pickupAt);
      if (age !== null && age < minAge) {
        throw new ConflictError(`Drivers must be ${minAge} or older to be insured on this car. Please choose another car.`, 'RENTER_TOO_YOUNG');
      }
    }
  },

  /** What is recorded on a booking: the car's insurance as it stood when it was booked. */
  async snapshot(vehicleId: string): Promise<Record<string, unknown> | undefined> {
    const car = await VehicleModel.findById(vehicleId).select('wheelbase').lean<Pick<VehicleDoc, 'wheelbase'>>();
    const wb = car?.wheelbase;
    if (!wb) return undefined;
    return {
      provider: 'wheelbase',
      rentalId: wb.rentalId,
      insuranceState: wb.insuranceState,
      coverage: wb.coverage,
      planLabel: wb.planLabel,
      minRenterAge: wb.minRenterAge,
      checkedAt: wb.syncedAt,
    };
  },
};
