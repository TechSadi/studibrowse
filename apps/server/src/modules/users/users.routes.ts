import { Router } from 'express';
import {
  followListQuerySchema,
  updateMeSchema,
  userIdParamsSchema,
  usernameAvailabilityQuerySchema,
  usernameParamsSchema,
} from '@studibrowse/shared';
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
  // After the fixed paths above, so /suggestions and /me/following keep matching them.
  router.get('/:username', requireAuth, validateParams(usernameParamsSchema), controller.profile);
  const listParts = [requireAuth, validateParams(usernameParamsSchema), validateQuery(followListQuerySchema)];
  router.get('/:username/followers', ...listParts, controller.followers);
  router.get('/:username/following', ...listParts, controller.followingOf);
  return router;
}
