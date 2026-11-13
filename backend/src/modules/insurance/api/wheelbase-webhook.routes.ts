import { Router } from 'express';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { wheelbaseReservationSchema, wheelbaseReservationService, type WheelbaseReservationInput } from '../application/wheelbase-reservation.service';

const router = Router();

// Called by the Zapier zap on every new or changed Wheelbase reservation; the secret is checked before the body is read.
router.post(
  '/reservations',
  (req, _res, next) => {
    try {
      wheelbaseReservationService.assertCaller(req.header('x-crosscubes-secret'));
      next();
    } catch (err) {
      next(err);
    }
  },
  validate({ body: wheelbaseReservationSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await wheelbaseReservationService.ingest(req.body as WheelbaseReservationInput));
  }),
);

export const wheelbaseWebhookRoutes = router;
