import { Router } from 'express';
import { hubService } from '../application/hub.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    sendSuccess(res, await hubService.publicList());
  }),
);

// What running a city costs and earns, straight from the admin settings so the public page never goes stale.
router.get(
  '/licence-terms',
  asyncHandler(async (_req, res) => {
    const cfg = await platformConfigService.get();
    res.set('Cache-Control', 'public, max-age=300');
    sendSuccess(res, {
      licenceFeeCents: cfg.hubs.licenceFeeCents,
      termMonths: cfg.hubs.licenceTermMonths,
      holderShareBps: cfg.hubs.holderShareBps,
      partnerShareBps: 10_000 - cfg.assetPartner.managementFeeBps,
      currency: 'USD',
    });
  }),
);

export { router as hubsRoutes };
