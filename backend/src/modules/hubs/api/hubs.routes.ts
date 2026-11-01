import { Router } from 'express';
import { hubService } from '../application/hub.service';
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

export { router as hubsRoutes };
