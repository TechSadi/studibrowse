import { Router } from 'express';
import { latestSessionQuerySchema, mySessionsQuerySchema } from '@studibrowse/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validateQuery } from '../../middleware/validate';
import * as controller from './sessions.controller';

export function createSessionsRouter(): Router {
  const router = Router();
  router.get('/mine', requireAuth, validateQuery(mySessionsQuerySchema), controller.listMine);
  router.get('/mine/latest', requireAuth, validateQuery(latestSessionQuerySchema), controller.latestMine);
  return router;
}
