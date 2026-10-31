import rateLimit from 'express-rate-limit';
import { errorBody } from '../lib/errors';

export const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 20 };

/** Slows down password guessing and sign-up spam. Counts per IP, in memory (one server process in v1). */
export function createAuthRateLimiter() {
  return rateLimit({
    ...AUTH_RATE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
      res
        .status(options.statusCode)
        .json(errorBody('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'));
    },
  });
}
