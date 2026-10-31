import type { RequestHandler } from 'express';
import { unauthenticated } from '../modules/auth/auth.errors';
import { verifyAccessToken } from '../modules/auth/tokens';

/** Reads `Authorization: Bearer <access token>` and sets req.userId, or answers 401. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw unauthenticated();
  req.userId = verifyAccessToken(token);
  next();
};
