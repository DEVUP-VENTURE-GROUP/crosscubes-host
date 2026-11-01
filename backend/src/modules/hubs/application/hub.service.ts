import { randomInt } from 'crypto';
import { HubModel, type HubDoc, type HubStatus, type LicenceKind } from '../infrastructure/hub.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { hostService } from '../../hosts/application/host.service';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { hashPassword } from '../../auth/application/password';
import { haversineKm } from '../../risk/domain/risk-signals';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { HOUSE_FLEET_ROLE, ROLES, STAFF_ROLES } from '../../../shared/constants/rbac';

const KM_PER_MILE = 1.609344;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const generatePassword = (length = 16) => Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');

/** Statuses whose territory is claimed: a closed hub frees its area. */
const ACTIVE: HubStatus[] = ['setup', 'live', 'paused'];

let liveCache: { ids: string[]; until: number } | undefined;
export const clearLiveHubCache = () => {
  liveCache = undefined;
};

const NEXT: Record<HubStatus, HubStatus[]> = {
  setup: ['live', 'closed'],
  live: ['paused', 'closed'],
  paused: ['live', 'closed'],
  closed: [],
};

export interface HubInput {
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  territory: { lng: number; lat: number; radiusMiles: number; exclusive: boolean };
  franchisee: { legalName: string; contactName: string; email: string; phone?: string };
  agreement: { signedAt?: Date; startsAt?: Date; termYears: number };
  economics: { royaltyPct: number; techFeePct: number; marketingFundPct: number };
}

export interface LicenceInput {
  kind: LicenceKind;
  label: string;
  number?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  fileKey?: string;
}

const center = (h: Pick<HubDoc, 'territory'>) => ({ lng: h.territory.center.coordinates[0], lat: h.territory.center.coordinates[1] });
const milesBetween = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => haversineKm(a, b) / KM_PER_MILE;

function endsAt(agreement: { startsAt?: Date; termYears: number }): Date | undefined {
  if (!agreement.startsAt) return undefined;
  const end = new Date(agreement.startsAt);
  end.setUTCFullYear(end.getUTCFullYear() + agreement.termYears);
  return end;
}

export class HubService {
  async list(filter: { status?: HubStatus } = {}): Promise<HubDoc[]> {
    return HubModel.find(filter.status ? { status: filter.status } : {}).sort({ createdAt: 1 }).lean<HubDoc[]>();
  }

  async get(id: string): Promise<HubDoc> {
    const hub = await HubModel.findById(id).lean<HubDoc>();
    if (!hub) throw new NotFoundError('Hub');
    return hub;
  }

  /** Live hubs a guest or applicant can pick from; nothing about the franchisee or its money. */
  async publicList(): Promise<{ id: string; code: string; name: string; city: string; state: string }[]> {
    const hubs = await HubModel.find({ status: 'live' }).select('code name city state').sort({ name: 1 }).lean<HubDoc[]>();
    return hubs.map((h) => ({ id: h._id, code: h.code, name: h.name, city: h.city, state: h.state }));
  }

  async create(input: HubInput, by: string): Promise<HubDoc> {
    if (await HubModel.exists({ code: input.code.toUpperCase() })) throw new ConflictError('Another hub already uses that code', 'HUB_CODE_TAKEN');
    await this.assertTerritoryFree(input.territory);
    const agreement = { ...input.agreement, endsAt: endsAt(input.agreement) };
    const hub = await HubModel.create({
      ...input,
      territory: { center: { type: 'Point', coordinates: [input.territory.lng, input.territory.lat] }, radiusMiles: input.territory.radiusMiles, exclusive: input.territory.exclusive },
      agreement,
      status: 'setup',
      timeline: [{ at: new Date(), by, event: 'created' }],
    });
    return hub.toObject();
  }

  async update(id: string, patch: Partial<HubInput>, by: string): Promise<HubDoc> {
    const hub = await this.get(id);
    if (hub.status === 'closed') throw new ValidationError('A closed hub can’t be changed');
    if (patch.code && patch.code.toUpperCase() !== hub.code && (await HubModel.exists({ code: patch.code.toUpperCase() }))) {
      throw new ConflictError('Another hub already uses that code', 'HUB_CODE_TAKEN');
    }
    const $set: Record<string, unknown> = {};
    for (const key of ['code', 'name', 'city', 'state', 'timezone', 'franchisee', 'economics'] as const) if (patch[key] !== undefined) $set[key] = patch[key];
    if (patch.territory) {
      await this.assertTerritoryFree(patch.territory, id);
      $set.territory = { center: { type: 'Point', coordinates: [patch.territory.lng, patch.territory.lat] }, radiusMiles: patch.territory.radiusMiles, exclusive: patch.territory.exclusive };
    }
    if (patch.agreement) $set.agreement = { ...patch.agreement, endsAt: endsAt(patch.agreement) };
    const updated = await HubModel.findByIdAndUpdate(id, { $set, $push: { timeline: { at: new Date(), by, event: 'updated', note: Object.keys($set).join(', ') } } }, { new: true }).lean<HubDoc>();
    return updated!;
  }

  /** Everything still missing before a hub may take bookings. */
  launchBlockers(hub: HubDoc, now = new Date()): string[] {
    const blockers: string[] = [];
    if (!hub.operatorUserId || !hub.operatorHostId) blockers.push('Create the franchisee’s login.');
    if (!hub.agreement.signedAt) blockers.push('Record the date the franchise agreement was signed.');
    if (hub.agreement.endsAt && hub.agreement.endsAt <= now) blockers.push('The franchise agreement has ended. Renew it first.');
    const valid = (kind: LicenceKind) => hub.licences.some((l) => l.kind === kind && (!l.expiresAt || l.expiresAt > now));
    if (!valid('insurance')) blockers.push('Add the hub’s fleet insurance, with an expiry date in the future.');
    if (!valid('business_licence')) blockers.push('Add the franchisee’s business licence.');
    return blockers;
  }

  async setStatus(id: string, to: HubStatus, by: string, note?: string): Promise<HubDoc> {
    const hub = await this.get(id);
    if (!NEXT[hub.status].includes(to)) throw new ValidationError(`A ${hub.status} hub can’t move to ${to}`);
    if (to === 'live') {
      const blockers = this.launchBlockers(hub);
      if (blockers.length) throw new ValidationError(blockers.join(' '));
    }
    if ((to === 'paused' || to === 'closed') && !note?.trim()) throw new ValidationError('Say why, so the franchisee and the team can see it.');
    const $set: Record<string, unknown> = { status: to };
    if (to === 'live' && !hub.launchedAt) $set.launchedAt = new Date();
    // The status precondition stops two people moving the same hub at once.
    const updated = await HubModel.findOneAndUpdate(
      { _id: id, status: hub.status },
      { $set, $push: { timeline: { at: new Date(), by, event: to, note } } },
      { new: true },
    ).lean<HubDoc>();
    if (!updated) throw new ConflictError('Someone else just changed this hub. Reload and try again.', 'HUB_CHANGED');
    clearLiveHubCache();
    return updated;
  }

  /** Creates or upgrades the franchisee's login; a new password is returned once and never stored in plain text. */
  async assignOperator(id: string, input: { name: string; email: string }, by: string): Promise<{ username: string; password?: string }> {
    const hub = await this.get(id);
    if (hub.operatorUserId) throw new ConflictError('This hub already has a franchisee login', 'HUB_HAS_OPERATOR');
    const email = input.email.trim().toLowerCase();
    let user = await userRepository.findByEmail(email);
    let password: string | undefined;
    if (user) {
      if (user.roles.some((r) => STAFF_ROLES.includes(r))) throw new ValidationError('That email belongs to an HQ staff account. Use a different email for the franchisee.');
      if (await HubModel.exists({ operatorUserId: user._id })) throw new ConflictError('That person already runs another hub', 'OPERATOR_TAKEN');
      await UserModel.updateOne({ _id: user._id }, { $addToSet: { roles: { $each: [ROLES.HOST, HOUSE_FLEET_ROLE] } } });
    } else {
      password = generatePassword();
      const [firstName, ...rest] = input.name.trim().split(/\s+/);
      user = await userRepository.create({
        email,
        passwordHash: await hashPassword(password),
        firstName,
        lastName: rest.join(' ') || undefined,
        roles: [ROLES.HOST, HOUSE_FLEET_ROLE],
        status: 'active',
        emailVerified: true,
      });
    }
    let host = await hostService.getByUserId(user._id);
    if (!host) host = await hostService.onboard(user._id, hub.name);
    if (host.verificationStatus !== 'verified') await hostService.setVerification(host._id, 'verified');
    await HostModel.updateOne({ _id: host._id }, { $set: { hubId: hub._id } });
    const updated = await HubModel.updateOne(
      { _id: id, operatorUserId: { $exists: false } },
      { $set: { operatorUserId: user._id, operatorHostId: host._id }, $push: { timeline: { at: new Date(), by, event: 'operator_assigned', note: email } } },
    );
    if (!updated.modifiedCount) throw new ConflictError('Someone else just set this hub’s login. Reload and try again.', 'HUB_CHANGED');
    return { username: email, password };
  }

  async addLicence(id: string, input: LicenceInput, by: string): Promise<HubDoc> {
    const updated = await HubModel.findOneAndUpdate(
      { _id: id, status: { $ne: 'closed' } },
      { $push: { licences: { ...input, addedAt: new Date(), addedBy: by }, timeline: { at: new Date(), by, event: 'licence_added', note: input.label } } },
      { new: true },
    ).lean<HubDoc>();
    if (!updated) throw new NotFoundError('Hub');
    return updated;
  }

  async removeLicence(id: string, licenceId: string, by: string): Promise<HubDoc> {
    const updated = await HubModel.findOneAndUpdate(
      { _id: id, 'licences._id': licenceId },
      { $pull: { licences: { _id: licenceId } }, $push: { timeline: { at: new Date(), by, event: 'licence_removed' } } },
      { new: true },
    ).lean<HubDoc>();
    if (!updated) throw new NotFoundError('Licence');
    return updated;
  }

  /** The hub whose territory holds this point, nearest centre first; closed hubs claim nothing. */
  async resolveForPoint(lng: number, lat: number): Promise<string | undefined> {
    const hubs = await HubModel.find({ status: { $in: ACTIVE } }).select('territory').lean<HubDoc[]>();
    let best: { id: string; miles: number } | undefined;
    for (const h of hubs) {
      const miles = milesBetween({ lng, lat }, center(h));
      if (miles <= h.territory.radiusMiles && (!best || miles < best.miles)) best = { id: h._id, miles };
    }
    return best?.id;
  }

  async hubForOperator(userId: string): Promise<HubDoc | null> {
    return HubModel.findOne({ operatorUserId: userId, status: { $in: ACTIVE } }).lean<HubDoc>();
  }

  async isLive(hubId: string): Promise<boolean> {
    return !!(await HubModel.exists({ _id: hubId, status: 'live' }));
  }

  /** Ids of hubs taking bookings, cached briefly because every search asks; a status change shows within a minute. */
  async liveHubIds(now = Date.now()): Promise<string[]> {
    if (liveCache && liveCache.until > now) return liveCache.ids;
    const ids = (await HubModel.find({ status: 'live' }).select('_id').lean<{ _id: string }[]>()).map((h) => h._id);
    liveCache = { ids, until: now + 60_000 };
    return ids;
  }

  /** A car's hub: its owner's hub when the owner belongs to one, otherwise wherever the car is parked. */
  async hubForCar(hostHubId: string | undefined, lng: number, lat: number): Promise<string | undefined> {
    return hostHubId ?? (await this.resolveForPoint(lng, lat));
  }

  private async assertTerritoryFree(t: HubInput['territory'], ignoreId?: string): Promise<void> {
    const others = await HubModel.find({ status: { $in: ACTIVE }, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }).select('name territory').lean<HubDoc[]>();
    const clash = others.filter((o) => (t.exclusive || o.territory.exclusive) && milesBetween(t, center(o)) < t.radiusMiles + o.territory.radiusMiles);
    if (clash.length) {
      throw new ConflictError(`This area overlaps ${clash.map((c) => c.name).join(', ')}, which has an exclusive territory. Move the centre or shrink the radius.`, 'TERRITORY_OVERLAP');
    }
  }
}

export const hubService = new HubService();
