import { Router } from 'express';
import { updateMeSchema, userIdParamsSchema, usernameAvailabilityQuerySchema } from '@studibrowse/shared';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as controller from './users.controller';

export function createUsersRouter(): Router {
  const router = Router();
  // Public: the Sign up form checks the username as you type.
  router.get(
    '/username-available',
    validateQuery(usernameAvailabilityQuerySchema),
    controller.usernameAvailable,
  );
  router.patch('/me', requireAuth, validateBody(updateMeSchema), controller.updateMe);
  router.get('/me/following', requireAuth, controller.following);
  router.get('/suggestions', requireAuth, controller.suggestions);
  router.post('/:id/follow', requireAuth, validateParams(userIdParamsSchema), controller.follow);
  router.delete('/:id/follow', requireAuth, validateParams(userIdParamsSchema), controller.unfollow);
  return router;
}
