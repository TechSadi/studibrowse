import { Router } from 'express';
import {
  changeEmailSchema,
  deleteAccountSchema,
  followListQuerySchema,
  updateMeSchema,
  userIdParamsSchema,
  usernameAvailabilityQuerySchema,
  usernameParamsSchema,
} from '@studibrowse/shared';
import { createAuthRateLimiter, PASSWORD_CHECK_RATE_LIMIT } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as controller from './users.controller';

export interface UsersRouterDependencies {
  /** Called once an account is deleted. The server drops its sockets; tests may leave it out. */
  onAccountDeleted?: (userId: string) => void;
}

export function createUsersRouter({ onAccountDeleted }: UsersRouterDependencies = {}): Router {
  const router = Router();
  // Changing the email checks the password, so wrong guesses are limited per account.
  const passwordCheckLimiter = createAuthRateLimiter({
    ...PASSWORD_CHECK_RATE_LIMIT,
    keyGenerator: (req) => `password-check:${req.userId ?? ''}`,
    skipSuccessfulRequests: true,
  });
  // Public: the Sign up form checks the username as you type.
  router.get(
    '/username-available',
    validateQuery(usernameAvailabilityQuerySchema),
    controller.usernameAvailable,
  );
  router.patch('/me', requireAuth, validateBody(updateMeSchema), controller.updateMe);
  router.delete(
    '/me',
    requireAuth,
    validateBody(deleteAccountSchema),
    controller.createDeleteMeHandler(onAccountDeleted),
  );
  router.patch(
    '/me/email',
    requireAuth,
    passwordCheckLimiter,
    validateBody(changeEmailSchema),
    controller.changeEmail,
  );
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
