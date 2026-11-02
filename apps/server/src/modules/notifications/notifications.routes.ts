import { Router } from 'express';
import { markReadSchema, notificationsQuerySchema } from '@studibrowse/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody, validateQuery } from '../../middleware/validate';
import * as controller from './notifications.controller';

export function createNotificationsRouter(): Router {
  const router = Router();
  router.get('/', requireAuth, validateQuery(notificationsQuerySchema), controller.list);
  router.get('/unread-count', requireAuth, controller.unreadCount);
  router.post('/read', requireAuth, validateBody(markReadSchema), controller.markRead);
  return router;
}
