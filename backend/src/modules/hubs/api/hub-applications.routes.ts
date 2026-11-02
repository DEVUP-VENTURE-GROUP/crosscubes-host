import { Router } from 'express';
import { z } from 'zod';
import { hubApplicationService } from '../application/hub-application.service';
import { START_TIMELINES } from '../infrastructure/hub-application.model';
import { authenticate } from '../../../shared/middleware/authenticate';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  validate({
    body: z.object({
      fullName: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(7).max(20),
      companyName: z.string().trim().max(160).optional(),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use the two-letter state code'),
      about: z.string().trim().min(40, 'Tell us a little more, at least a few sentences.').max(3000),
      carsFirstYear: z.coerce.number().int().min(1).max(2000),
      startTimeline: z.enum(START_TIMELINES),
      hasBusinessEntity: z.boolean(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await hubApplicationService.apply(req.principal!.userId, req.body));
  }),
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await hubApplicationService.mine(req.principal!.userId));
  }),
);

router.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await hubApplicationService.startPayment(req.principal!.userId, req.params.id));
  }),
);

router.post(
  '/:id/payment-sync',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hubApplicationService.syncPayment(req.principal!.userId, req.params.id));
  }),
);

router.post(
  '/:id/withdraw',
  asyncHandler(async (req, res) => {
    await hubApplicationService.withdraw(req.principal!.userId, req.params.id);
    sendSuccess(res, { withdrawn: true });
  }),
);

export { router as hubApplicationsRoutes };
