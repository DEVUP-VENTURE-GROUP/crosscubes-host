import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerAgreementService } from '../application/asset-partner-agreement.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated } from '../../../shared/http/api-response';

// Mounted on the HQ admin router only: city operators can read the agreement but never publish one.
const router = Router();

/** Publishes a new version; partners who already signed keep the version they signed. */
router.post(
  '/asset-partner-agreements',
  authorize('host:manage'),
  validate({ body: z.object({ kind: z.enum(['agreement', 'nda', 'amendment']).default('agreement'), title: z.string().trim().min(3).max(160), body: z.string().trim().min(50).max(100_000) }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerAgreementService.publish(req.principal!.userId, req.body));
  }),
);

export const assetPartnerAgreementAdminRoutes = router;
