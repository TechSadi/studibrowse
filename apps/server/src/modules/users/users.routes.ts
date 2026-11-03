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
import {
  createAuthRateLimiter,
  createUserRateLimiter,
  FOLLOW_RATE_LIMIT,
  PASSWORD_CHECK_RATE_LIMIT,
  PROFILE_UPDATE_RATE_LIMIT,
  USERNAME_CHECK_RATE_LIMIT,
} from '../../middleware/rateLimit';
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
  // One budget for following and unfollowing, so toggling back and forth counts too.
  const followLimiter = createUserRateLimiter(FOLLOW_RATE_LIMIT);
  // Public: the Sign up form checks the username as you type. Limited per IP against bulk probing.
  router.get(
    '/username-available',
    createAuthRateLimiter(USERNAME_CHECK_RATE_LIMIT),
    validateQuery(usernameAvailabilityQuerySchema),
    controller.usernameAvailable,
  );
  router.patch(
    '/me',
    requireAuth,
    createUserRateLimiter(PROFILE_UPDATE_RATE_LIMIT),
    validateBody(updateMeSchema),
    controller.updateMe,
  );
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
  router.post(
    '/:id/follow',
    requireAuth,
    followLimiter,
    validateParams(userIdParamsSchema),
    controller.follow,
  );
  router.delete(
    '/:id/follow',
    requireAuth,
    followLimiter,
    validateParams(userIdParamsSchema),
    controller.unfollow,
  );
  // After the fixed paths above, so /suggestions and /me/following keep matching them.
  router.get('/:username', requireAuth, validateParams(usernameParamsSchema), controller.profile);
  const listParts = [requireAuth, validateParams(usernameParamsSchema), validateQuery(followListQuerySchema)];
  router.get('/:username/followers', ...listParts, controller.followers);
  router.get('/:username/following', ...listParts, controller.followingOf);
  return router;
}
