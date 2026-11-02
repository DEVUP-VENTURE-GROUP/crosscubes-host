import { randomInt } from 'crypto';
import { HubApplicationModel, type HubApplicationDoc, type HubRejectionReason, START_TIMELINES } from '../infrastructure/hub-application.model';
import { HubModel } from '../infrastructure/hub.model';
import { hubService, type HubInput } from './hub.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { STAFF_ROLES } from '../../../shared/constants/rbac';
import { logger } from '../../../infrastructure/logging/logger';

const OPEN: HubApplicationDoc['status'][] = ['submitted', 'approved'];

export const REJECTION_TEXT: Record<HubRejectionReason, { why: string; improve: string }> = {
  territory_taken: { why: 'Another licence holder already runs that area.', improve: 'Apply for a nearby city we don’t cover yet.' },
  market_not_ready: { why: 'We’re not ready to open in that city yet.', improve: 'We’ll keep your details and contact you when we open there.' },
  experience: { why: 'We need more experience running cars or a local team.', improve: 'Tell us about any fleet, rental or operations work you’ve done, then apply again.' },
  capital: { why: 'The plan doesn’t yet cover the cars and running costs a city needs.', improve: 'Show how you’ll fund the first year, then apply again.' },
  incomplete: { why: 'Some details were missing or couldn’t be checked.', improve: 'Fill in every section and make sure your phone and email are right.' },
  other: { why: 'It isn’t the right fit right now.', improve: 'Read the note from our team below.' },
};

export interface ApplyInput {
  fullName: string;
  phone: string;
  companyName?: string;
  city: string;
  state: string;
  about: string;
  carsFirstYear: number;
  startTimeline: (typeof START_TIMELINES)[number];
  hasBusinessEntity: boolean;
}

export type ApproveInput = Pick<HubInput, 'code' | 'name' | 'timezone' | 'territory' | 'economics'>;

function reference(): string {
  return `CC-HUB-${randomInt(100000, 1000000)}`;
}

export class HubApplicationService {
  /** A signed-in account applies to run a city; one open application at a time. */
  async apply(userId: string, input: ApplyInput): Promise<HubApplicationDoc> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') throw new ForbiddenError('Sign in to apply.');
    if (!user.emailVerified) throw new ValidationError('Confirm your email address first, so we can reach you about your application.');
    if (user.roles.some((r) => STAFF_ROLES.includes(r))) throw new ValidationError('HQ staff accounts can’t apply for a city licence.');
    if (await HubModel.exists({ operatorUserId: userId, status: { $ne: 'closed' } })) throw new ConflictError('You already hold a city licence.', 'ALREADY_HOLDER');
    if (await HubApplicationModel.exists({ userId, status: { $in: OPEN } })) throw new ConflictError('You already have an application with us.', 'APPLICATION_OPEN');

    let ref = reference();
    if (await HubApplicationModel.exists({ reference: ref })) ref = reference();
    const doc = await HubApplicationModel.create({
      reference: ref,
      userId,
      applicant: { ...input, email: user.email },
      timeline: [{ at: new Date(), by: userId, event: 'submitted' }],
    });
    logger.info({ reference: ref }, 'new city licence application');
    return doc.toObject();
  }

  /** The applicant's latest application, with what they owe and where their hub stands. */
  async mine(userId: string) {
    const app = await HubApplicationModel.findOne({ userId }).sort({ createdAt: -1 }).lean<HubApplicationDoc>();
    if (!app) return null;
    const hub = app.hubId ? await HubModel.findById(app.hubId).select('code name status licence').lean<{ code: string; name: string; status: string; licence?: { expiresAt?: Date } }>() : null;
    return {
      id: app._id,
      reference: app.reference,
      status: app.status,
      city: app.applicant.city,
      state: app.applicant.state,
      submittedAt: app.createdAt,
      licenceFeeCents: app.licenceFeeCents,
      paidAt: app.payment?.paidAt,
      decisionNote: app.decision?.note,
      rejection: app.status === 'rejected' ? (app.decision?.reasons ?? []).map((r) => REJECTION_TEXT[r]) : undefined,
      hub: hub ? { code: hub.code, name: hub.name, status: hub.status, licenceExpiresAt: hub.licence?.expiresAt } : null,
    };
  }

  async list(filter: { status?: HubApplicationDoc['status'] } = {}): Promise<HubApplicationDoc[]> {
    return HubApplicationModel.find(filter.status ? { status: filter.status } : {}).sort({ createdAt: -1 }).limit(200).lean<HubApplicationDoc[]>();
  }

  async get(id: string): Promise<HubApplicationDoc> {
    const app = await HubApplicationModel.findById(id).lean<HubApplicationDoc>();
    if (!app) throw new NotFoundError('Application');
    return app;
  }

  /** HQ approves: the hub is created in setup with the applicant as holder, and the licence price is fixed for them. */
  async approve(id: string, by: string, hubInput: ApproveInput, note?: string): Promise<HubApplicationDoc> {
    const app = await this.get(id);
    if (app.status !== 'submitted') throw new ConflictError('Only a new application can be approved.', 'APPLICATION_STATE');
    const hub = await hubService.create(
      {
        ...hubInput,
        city: app.applicant.city,
        state: app.applicant.state,
        holder: { legalName: app.applicant.companyName || app.applicant.fullName, contactName: app.applicant.fullName, email: app.applicant.email, phone: app.applicant.phone },
      },
      by,
      { applicationId: app._id },
    );
    const fee = (await platformConfigService.get()).hubs.licenceFeeCents;
    const updated = await HubApplicationModel.findOneAndUpdate(
      { _id: id, status: 'submitted' },
      {
        $set: { status: 'approved', hubId: hub._id, licenceFeeCents: fee, decision: { by, at: new Date(), note: note?.trim() || undefined } },
        $push: { timeline: { at: new Date(), by, event: 'approved', note } },
      },
      { new: true },
    ).lean<HubApplicationDoc>();
    if (!updated) {
      // Someone decided it at the same moment; the hub made here must not outlive the lost race.
      await HubModel.deleteOne({ _id: hub._id, status: 'setup', operatorUserId: { $exists: false } });
      throw new ConflictError('Someone else just decided this application. Reload it.', 'APPLICATION_STATE');
    }
    await notificationService.send({
      userId: app.userId,
      priority: 'high',
      templateKey: 'hub.application_approved',
      title: `You’re approved to run ${hub.name}`,
      body: 'Pay your city licence to open your hub portal and start bringing on car partners.',
      deepLink: '/cities/application',
      data: { applicationId: app._id },
    });
    return updated;
  }

  async reject(id: string, by: string, reasons: HubRejectionReason[], note?: string): Promise<HubApplicationDoc> {
    if (!reasons.length) throw new ValidationError('Pick at least one reason, so the applicant knows what to change.');
    const updated = await HubApplicationModel.findOneAndUpdate(
      { _id: id, status: 'submitted' },
      { $set: { status: 'rejected', decision: { by, at: new Date(), reasons, note: note?.trim() || undefined } }, $push: { timeline: { at: new Date(), by, event: 'rejected', note } } },
      { new: true },
    ).lean<HubApplicationDoc>();
    if (!updated) throw new ConflictError('Only a new application can be declined.', 'APPLICATION_STATE');
    await notificationService.send({
      userId: updated.userId,
      templateKey: 'hub.application_declined',
      title: 'About your city licence application',
      body: `${REJECTION_TEXT[reasons[0]].why} ${REJECTION_TEXT[reasons[0]].improve}`,
      deepLink: '/cities/application',
      data: { applicationId: id },
    });
    return updated;
  }

  async withdraw(userId: string, id: string): Promise<void> {
    const res = await HubApplicationModel.updateOne(
      { _id: id, userId, status: 'submitted' },
      { $set: { status: 'withdrawn' }, $push: { timeline: { at: new Date(), by: userId, event: 'withdrawn' } } },
    );
    if (!res.modifiedCount) throw new ConflictError('Only an application that hasn’t been decided can be withdrawn.', 'APPLICATION_STATE');
  }

  /** The applicant pays the licence on the page; an unfinished payment is resumed, never doubled. */
  async startPayment(userId: string, id: string): Promise<{ clientSecret: string; amountCents: number }> {
    const app = await this.get(id);
    if (app.userId !== userId) throw new NotFoundError('Application');
    if (app.status !== 'approved' || !app.licenceFeeCents) throw new ConflictError('This application isn’t waiting for payment.', 'APPLICATION_STATE');
    if (app.payment?.intentId) {
      const existing = await paymentGateway.retrieveIntent(app.payment.intentId);
      if (existing.status === 'succeeded') {
        await this.recordPayment(id, existing.intentId);
        throw new ConflictError('This licence is already paid.', 'ALREADY_PAID');
      }
      if (existing.status !== 'canceled') return { clientSecret: existing.clientSecret, amountCents: app.licenceFeeCents };
    }
    const intent = await paymentGateway.createIntent({
      amount: { amount: app.licenceFeeCents, currency: 'USD' },
      userId,
      capture: true,
      anyMethod: true,
      idempotencyKey: `hub-licence-${id}-${app.timeline.length}`,
      metadata: { kind: 'hub_licence', applicationId: id },
    });
    await HubApplicationModel.updateOne({ _id: id, status: 'approved' }, { $set: { 'payment.intentId': intent.intentId } });
    return { clientSecret: intent.clientSecret, amountCents: app.licenceFeeCents };
  }

  /** The payer's page asks after Stripe confirms, so the portal opens without waiting for the webhook. */
  async syncPayment(userId: string, id: string): Promise<{ paid: boolean }> {
    const app = await this.get(id);
    if (app.userId !== userId) throw new NotFoundError('Application');
    if (app.status === 'paid') return { paid: true };
    if (!app.payment?.intentId) return { paid: false };
    const intent = await paymentGateway.retrieveIntent(app.payment.intentId);
    if (intent.status !== 'succeeded') return { paid: false };
    await this.recordPayment(id, intent.intentId);
    return { paid: true };
  }

  /** A paid licence: one term on the hub, the applicant's account becomes its holder login, the application closes. */
  async recordPayment(id: string, intentId: string): Promise<void> {
    const app = await this.get(id);
    if (app.status === 'paid') return;
    if (app.status !== 'approved' || !app.hubId) {
      // Money arrived for an application no longer waiting for it; staff refund or reopen it by hand.
      logger.error({ applicationId: id, intentId, status: app.status }, 'licence payment for an application not awaiting payment');
      return;
    }
    try {
      await hubService.recordLicencePayment(app.hubId, { reference: intentId, feeCents: app.licenceFeeCents }, 'system');
    } catch (err) {
      const hub = await hubService.get(app.hubId);
      if (!hub.licence?.terms?.some((t) => t.reference === intentId)) throw err;
    }
    const hub = await hubService.get(app.hubId);
    if (!hub.operatorUserId) await hubService.assignOperator(app.hubId, { name: app.applicant.fullName, email: app.applicant.email }, 'system');
    const updated = await HubApplicationModel.updateOne(
      { _id: id, status: 'approved' },
      { $set: { status: 'paid', 'payment.paidAt': new Date(), 'payment.intentId': intentId }, $push: { timeline: { at: new Date(), by: 'system', event: 'paid' } } },
    );
    if (!updated.modifiedCount) return;
    await notificationService.send({
      userId: app.userId,
      priority: 'high',
      templateKey: 'hub.licence_paid',
      title: `Your ${hub.name} hub portal is open`,
      body: 'Sign in to the hub portal with this account. Send HQ your fleet insurance and business licence, and we’ll put your city live.',
      deepLink: '/cities/application',
      data: { applicationId: id, hubId: app.hubId },
    });
  }
}

export const hubApplicationService = new HubApplicationService();
