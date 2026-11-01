import { Router } from 'express';
import { latestSessionQuerySchema } from '@studibrowse/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validateQuery } from '../../middleware/validate';
import * as controller from './sessions.controller';

export function createSessionsRouter(): Router {
  const router = Router();
  router.get('/mine/latest', requireAuth, validateQuery(latestSessionQuerySchema), controller.latestMine);
  return router;
}
