jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../../payments/infrastructure/mock.gateway').MockGateway)() }));

import { hubApplicationService, type ApplyInput } from './hub-application.service';
import { clearLiveHubCache } from './hub.service';
import { HubModel } from '../infrastructure/hub.model';
import { HubApplicationModel } from '../infrastructure/hub-application.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { WebhookEventModel } from '../../payments/infrastructure/webhook-event.model';
import { runStripeEvent } from '../../payments/application/stripe-event.handler';
import { dashboardRefundService } from '../../payments/application/dashboard-refund.service';
import { config } from '../../../config';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  clearLiveHubCache();
});

const form = (over: Partial<ApplyInput> = {}): ApplyInput => ({
  fullName: 'Ana Ruiz',
  phone: '7135550142',
  companyName: 'Bayou Mobility LLC',
  city: 'Houston',
  state: 'TX',
  about: 'I ran a 30-car rental fleet in Houston for four years and have a local cleaning and delivery team ready.',
  carsFirstYear: 25,
  startTimeline: 'now',
  hasBusinessEntity: true,
  ...over,
});

const hub = { code: 'HOU', name: 'Houston', timezone: 'America/Chicago', territory: { lng: -95.3698, lat: 29.7604, radiusMiles: 40, exclusive: true } };

async function applicant(emailVerified = true) {
  return String((await UserModel.create({ email: 'ana@bayou.example', firstName: 'Ana', roles: ['guest'], status: 'active', emailVerified }))._id);
}

describe('applying to run a city', () => {
  it('needs a confirmed email and allows one open application', async () => {
    const unverified = await applicant(false);
    await expect(hubApplicationService.apply(unverified, form())).rejects.toThrow('Confirm your email');
    await UserModel.updateOne({ _id: unverified }, { emailVerified: true });
    const app = await hubApplicationService.apply(unverified, form());
    expect(app).toMatchObject({ status: 'submitted', applicant: { email: 'ana@bayou.example', city: 'Houston' } });
    expect(app.reference).toMatch(/^CC-HUB-\d{6}$/);
    await expect(hubApplicationService.apply(unverified, form())).rejects.toThrow('already have an application');
  });

  it('approve, pay, portal: the payment counts once and the applicant becomes the holder with their own login', async () => {
    const userId = await applicant();
    const app = await hubApplicationService.apply(userId, form());
    const approved = await hubApplicationService.approve(app._id, 'hq', hub, 'Strong fleet background');
    expect(approved).toMatchObject({ status: 'approved', licenceFeeCents: 100_000 });
    const created = await HubModel.findById(approved.hubId).lean();
    expect(created).toMatchObject({ status: 'setup', holder: { legalName: 'Bayou Mobility LLC', email: 'ana@bayou.example' } });

    await expect(hubApplicationService.startPayment('someone-else', app._id)).rejects.toThrow();
    const pay = await hubApplicationService.startPayment(userId, app._id);
    expect(pay.amountCents).toBe(100_000);
    const again = await hubApplicationService.startPayment(userId, app._id);
    expect(again.clientSecret).toBe(pay.clientSecret);

    const intentId = (await HubApplicationModel.findById(app._id).lean())!.payment!.intentId!;
    await hubApplicationService.recordPayment(app._id, intentId);
    await hubApplicationService.recordPayment(app._id, intentId);

    const paidHub = await HubModel.findById(approved.hubId).lean();
    expect(paidHub!.licence.terms).toHaveLength(1);
    expect(paidHub!.operatorUserId).toBe(userId);
    expect((await UserModel.findById(userId).lean())!.roles).toEqual(expect.arrayContaining(['house_fleet', 'host']));
    expect(await hubApplicationService.mine(userId)).toMatchObject({ status: 'paid', hub: { code: 'HOU', status: 'setup' } });
  });

  it('declines with reasons the applicant can act on', async () => {
    const userId = await applicant();
    const app = await hubApplicationService.apply(userId, form());
    await expect(hubApplicationService.reject(app._id, 'hq', [])).rejects.toThrow('Pick at least one reason');
    await hubApplicationService.reject(app._id, 'hq', ['capital'], 'Share a funding plan for 25 cars.');
    const mine = await hubApplicationService.mine(userId);
    expect(mine).toMatchObject({ status: 'rejected', decisionNote: 'Share a funding plan for 25 cars.' });
    expect(mine!.rejection![0].improve).toMatch(/fund the first year/);
    await expect(hubApplicationService.approve(app._id, 'hq', hub)).rejects.toThrow('Only a new application');
    expect(await HubModel.countDocuments()).toBe(0);
  });
});

describe('a Stripe account shared with CrossCubes', () => {
  it('records a licence paid through the webhook and leaves the other system’s payments alone', async () => {
    const userId = await applicant();
    const app = await hubApplicationService.apply(userId, form());
    const approved = await hubApplicationService.approve(app._id, 'hq', hub);

    const event = (id: string, app: string) => ({ id, type: 'payment_intent.succeeded', data: { object: { id: `pi_${id}`, metadata: { app, kind: 'hub_licence', applicationId: approved._id, userId } } } });
    await WebhookEventModel.create({ _id: 'evt_other', type: 'payment_intent.succeeded' });
    await runStripeEvent(event('evt_other', 'catodrive'));
    expect((await HubModel.findById(approved.hubId).lean())!.licence.terms).toHaveLength(0);
    expect((await WebhookEventModel.findById('evt_other').lean())!.status).toBe('processed');

    // The other system's refunds carry its tag on the charge and are skipped too.
    const reconcile = jest.spyOn(dashboardRefundService, 'reconcile');
    await WebhookEventModel.create({ _id: 'evt_other_refund', type: 'charge.refunded' });
    await runStripeEvent({ id: 'evt_other_refund', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_other', amount_refunded: 500, metadata: { app: 'catodrive' } } } });
    await WebhookEventModel.create({ _id: 'evt_untagged_refund', type: 'charge.refunded' });
    await runStripeEvent({ id: 'evt_untagged_refund', type: 'charge.refunded', data: { object: { id: 'ch_2', payment_intent: 'pi_untagged', amount_refunded: 500 } } });
    expect(reconcile).not.toHaveBeenCalled();
    expect((await WebhookEventModel.findById('evt_other_refund').lean())!.status).toBe('processed');
    reconcile.mockRestore();

    await WebhookEventModel.create({ _id: 'evt_ours', type: 'payment_intent.succeeded' });
    await runStripeEvent(event('evt_ours', config.app.key));
    expect((await HubModel.findById(approved.hubId).lean())!.licence.terms).toHaveLength(1);
    expect((await HubApplicationModel.findById(app._id).lean())!.status).toBe('paid');
  });
});
