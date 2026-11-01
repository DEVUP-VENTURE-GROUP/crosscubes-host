import { Router } from 'express';
import { z } from 'zod';
import { hubService } from '../application/hub.service';
import { hubAnalyticsService } from '../application/hub-analytics.service';
import { HUB_STATUSES, LICENCE_KINDS } from '../infrastructure/hub.model';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { PERMISSIONS } from '../../../shared/constants/rbac';
import { ValidationError } from '../../../core/errors/app-error';

const router = Router();
const MANAGE = PERMISSIONS.HUB_MANAGE;

const hubBody = z.object({
  code: z.string().trim().regex(/^[A-Za-z]{2,6}$/, 'Use 2 to 6 letters, like HOU'),
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use the two-letter state code'),
  timezone: z.string().trim().min(3).max(60),
  territory: z.object({
    lng: z.coerce.number().min(-180).max(180),
    lat: z.coerce.number().min(-90).max(90),
    radiusMiles: z.coerce.number().min(1).max(300),
    exclusive: z.boolean(),
  }),
  holder: z.object({
    legalName: z.string().trim().min(2).max(120),
    contactName: z.string().trim().min(2).max(80),
    email: z.string().trim().email(),
    phone: z.string().trim().max(30).optional(),
  }),
  // Left out, the hub uses the platform's holder share.
  economics: z.object({ holderShareBps: z.coerce.number().int().min(0).max(5000).optional() }).optional(),
});

router.get(
  '/hubs/overview',
  authorize(PERMISSIONS.ANALYTICS_READ),
  validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const q = req.query as { from?: Date; to?: Date };
    const from = q.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = q.to ?? now;
    if (to <= from) throw new ValidationError('The end date must be after the start date.');
    if (to.getTime() - from.getTime() > 366 * 86_400_000) throw new ValidationError('Pick a period of a year or less.');
    sendSuccess(res, await hubAnalyticsService.overview({ from, to }, now));
  }),
);

router.get(
  '/hubs',
  validate({ query: z.object({ status: z.enum(HUB_STATUSES).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hubService.list(req.query as never));
  }),
);

router.get(
  '/hubs/:id',
  asyncHandler(async (req, res) => {
    const hub = await hubService.get(req.params.id);
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, { ...hub, holderShareBps: await hubService.holderShareBps(hub), launchBlockers: hub.status === 'closed' ? [] : hubService.launchBlockers(hub) });
  }),
);

router.post(
  '/hubs',
  authorize(MANAGE),
  validate({ body: hubBody }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await hubService.create(req.body, req.principal!.userId));
  }),
);

router.patch(
  '/hubs/:id',
  authorize(MANAGE),
  validate({ body: hubBody.partial() }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hubService.update(req.params.id, req.body, req.principal!.userId));
  }),
);

router.post(
  '/hubs/:id/status',
  authorize(MANAGE),
  validate({ body: z.object({ status: z.enum(HUB_STATUSES), note: z.string().trim().max(500).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hubService.setStatus(req.params.id, req.body.status, req.principal!.userId, req.body.note));
  }),
);

router.post(
  '/hubs/:id/operator',
  authorize(MANAGE),
  validate({ body: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email() }) }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    sendCreated(res, await hubService.assignOperator(req.params.id, req.body, req.principal!.userId));
  }),
);

/** A licence payment taken outside the site (bank transfer, card on the phone); online payments record themselves. */
router.post(
  '/hubs/:id/licence-payments',
  authorize(MANAGE),
  validate({
    body: z.object({
      paidAt: z.coerce.date().optional(),
      feeCents: z.coerce.number().int().min(0).optional(),
      reference: z.string().trim().max(120).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await hubService.recordLicencePayment(req.params.id, req.body, req.principal!.userId));
  }),
);

router.post(
  '/hubs/:id/documents',
  authorize(MANAGE),
  validate({
    body: z.object({
      kind: z.enum(LICENCE_KINDS),
      label: z.string().trim().min(2).max(120),
      number: z.string().trim().max(80).optional(),
      issuedAt: z.coerce.date().optional(),
      expiresAt: z.coerce.date().optional(),
      fileKey: z.string().trim().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await hubService.addDocument(req.params.id, req.body, req.principal!.userId));
  }),
);

router.delete(
  '/hubs/:id/documents/:documentId',
  authorize(MANAGE),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hubService.removeDocument(req.params.id, req.params.documentId, req.principal!.userId));
  }),
);

export { router as hubsAdminRoutes };
