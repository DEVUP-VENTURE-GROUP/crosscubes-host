import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';
import { wheelbaseReservationService } from '../application/wheelbase-reservation.service';
import { wheelbaseInsuranceService } from '../application/wheelbase-insurance.service';

const router = Router();

/** Every car with its city, Wheelbase link and insurance, and the dealer's listings to link to. */
router.get(
  '/insurance/wheelbase',
  authorize('admin:read'),
  validate({ query: z.object({ hubId: z.string().trim().min(1).max(64).optional() }) }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await wheelbaseInsuranceService.overview({ hubId: req.query.hubId as string | undefined }));
  }),
);

/** Reservations Wheelbase has sent through the zap, newest pickup first; optionally one city's. */
router.get(
  '/insurance/wheelbase/reservations',
  authorize('admin:read'),
  validate({ query: z.object({ hubId: z.string().trim().min(1).max(64).optional() }) }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await wheelbaseReservationService.list({ hubId: req.query.hubId as string | undefined, limit: 200 }));
  }),
);

/** Read Wheelbase now instead of waiting for the next scheduled check. */
router.post(
  '/insurance/wheelbase/sync',
  authorize('vehicle:verify'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await wheelbaseInsuranceService.sync());
  }),
);

/** Tie a car to a Wheelbase listing, or clear it with null. */
router.patch(
  '/insurance/wheelbase/vehicles/:id',
  authorize('vehicle:verify'),
  validate({ body: z.object({ rentalId: z.number().int().positive().nullable() }) }),
  asyncHandler(async (req, res) => {
    await wheelbaseInsuranceService.link(req.params.id, req.body.rentalId);
    sendSuccess(res, { ok: true });
  }),
);

export const insuranceAdminRoutes = router;
