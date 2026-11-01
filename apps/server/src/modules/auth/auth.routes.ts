import { Router } from 'express';
import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '@studibrowse/shared';
import type { EmailService } from '../../lib/email';
import {
  createAccountRateLimiter,
  createAuthRateLimiter,
  FORGOT_ACCOUNT_RATE_LIMIT,
  LOGIN_ACCOUNT_RATE_LIMIT,
} from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody } from '../../middleware/validate';
import * as controller from './auth.controller';
import type { GoogleVerifier } from './google';

export interface AuthRouterDependencies {
  emailService: EmailService;
  verifyGoogleToken: GoogleVerifier;
}

export function createAuthRouter({ emailService, verifyGoogleToken }: AuthRouterDependencies): Router {
  const router = Router();
  // Every endpoint that takes a password, an email or a Google token shares one per-IP limit.
  // Refresh runs on every page load and /me after it, so counting them would lock out someone who
  // just reloads a few times.
  const ipLimiter = createAuthRateLimiter();
  // Per-account limits stop many IPs from hammering one account. They key on the normalised body,
  // so they run after validation.
  const loginAccountLimiter = createAccountRateLimiter('identifier', {
    ...LOGIN_ACCOUNT_RATE_LIMIT,
    skipSuccessfulRequests: true,
  });
  const forgotAccountLimiter = createAccountRateLimiter('email', FORGOT_ACCOUNT_RATE_LIMIT);

  router.post('/signup', ipLimiter, validateBody(signupSchema), controller.signup);
  router.post('/login', ipLimiter, validateBody(loginSchema), loginAccountLimiter, controller.login);
  router.post(
    '/google',
    ipLimiter,
    validateBody(googleAuthSchema),
    controller.createGoogleHandler(verifyGoogleToken),
  );
  router.post(
    '/forgot',
    ipLimiter,
    validateBody(forgotPasswordSchema),
    forgotAccountLimiter,
    controller.createForgotPasswordHandler(emailService),
  );
  router.post('/reset', ipLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  return router;
}
