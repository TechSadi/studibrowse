import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { errorBody } from '../lib/errors';

export const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 20 };

/** Failed logins allowed per account (email or username) per window, on top of the per-IP limit. */
export const LOGIN_ACCOUNT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };

/** Reset emails per address per window. Leaves room for the "Send again" button. */
export const FORGOT_ACCOUNT_RATE_LIMIT = { windowMs: 60 * 60 * 1000, limit: 3 };

/** Wrong current passwords (Settings › change email) per account per window. */
export const PASSWORD_CHECK_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };

/** Invite previews per IP per window: plenty for real links, far too few to guess codes. */
export const INVITE_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 60 };

/** Signed uploads per person per window: a busy study session shares a handful of files, not dozens. */
export const UPLOAD_SIGN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 30 };

/** Rooms created per person per window. Each public one notifies every follower, so this caps that fan-out. */
export const ROOM_CREATE_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };

/** Follows and unfollows together per person per window. */
export const FOLLOW_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 60 };

/** Profile and settings saves per person per window. Settings saves each toggle, so it's generous. */
export const PROFILE_UPDATE_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 60 };

/** Username checks per IP per window. The Sign up form checks as you type (debounced). */
export const USERNAME_CHECK_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 120 };

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  /** Counts per IP when omitted. */
  keyGenerator?: (req: Request) => string;
  /** Count only requests that fail (status >= 400). */
  skipSuccessfulRequests?: boolean;
}

/** Slows down password guessing and sign-up spam. Counts in memory (one server process in v1). */
export function createAuthRateLimiter(options: RateLimitOptions = AUTH_RATE_LIMIT) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res, _next, limiterOptions) => {
      res
        .status(limiterOptions.statusCode)
        .json(errorBody('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'));
    },
  });
}

/** Counts per signed-in person, so it must run after requireAuth. */
export function createUserRateLimiter(options: Omit<RateLimitOptions, 'keyGenerator'>) {
  return createAuthRateLimiter({ ...options, keyGenerator: (req) => `user:${req.userId ?? ''}` });
}

/**
 * Counts per account, keyed by a field of the validated body, so it must run after validateBody.
 * Any string counts the same whether or not an account uses it, so a 429 reveals nothing.
 */
export function createAccountRateLimiter(field: string, options: Omit<RateLimitOptions, 'keyGenerator'>) {
  return createAuthRateLimiter({
    ...options,
    keyGenerator: (req) => `account:${String((req.body as Record<string, unknown>)[field])}`,
  });
}
