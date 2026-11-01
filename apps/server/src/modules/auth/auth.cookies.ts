import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';

export const REFRESH_COOKIE = 'sb_refresh';

const baseOptions: CookieOptions = {
  httpOnly: true,
  // Browsers treat http://localhost as secure, so this works in development too.
  secure: true,
  sameSite: 'lax',
  // Only the auth endpoints ever see the refresh token.
  path: '/api/auth',
};

/** Persistent for "keep me logged in"; otherwise a session cookie that ends when the browser closes. */
export function setRefreshCookie(res: Response, token: string, persistent: boolean): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions,
    ...(persistent && { maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 }),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}
