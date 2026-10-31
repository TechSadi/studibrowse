import { Router } from 'express';
import { loginSchema, signupSchema } from '@studibrowse/shared';
import { createAuthRateLimiter } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody } from '../../middleware/validate';
import * as controller from './auth.controller';

export function createAuthRouter(): Router {
  const router = Router();
  // Only the password endpoints are rate limited. Refresh runs on every page load and /me after it,
  // so counting them would lock out someone who just reloads a few times.
  const passwordLimiter = createAuthRateLimiter();

  router.post('/signup', passwordLimiter, validateBody(signupSchema), controller.signup);
  router.post('/login', passwordLimiter, validateBody(loginSchema), controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  return router;
}
