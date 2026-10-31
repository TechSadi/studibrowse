import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';
import { env } from '../../config/env';
import { accessTokenExpired, unauthenticated } from './auth.errors';

const ALGORITHM = 'HS256';

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Returns the user id in the token, or throws TOKEN_EXPIRED / UNAUTHENTICATED. */
export function verifyAccessToken(token: string): string {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw accessTokenExpired();
    throw unauthenticated();
  }
  if (typeof payload === 'string' || !isValidObjectId(payload.sub)) throw unauthenticated();
  return payload.sub as string;
}

/** An opaque, high-entropy token. Only its hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256 is enough here: the token is 256 random bits, so there is nothing to brute-force.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
