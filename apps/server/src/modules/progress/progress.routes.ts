import { Router } from 'express';
import { progressSummaryQuerySchema } from '@studibrowse/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validateQuery } from '../../middleware/validate';
import * as controller from './progress.controller';

export function createProgressRouter(): Router {
  const router = Router();
  router.get('/summary', requireAuth, validateQuery(progressSummaryQuerySchema), controller.summary);
  return router;
}
