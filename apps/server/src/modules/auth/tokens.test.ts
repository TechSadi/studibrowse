import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env';
import { generateRefreshToken, hashToken, signAccessToken, verifyAccessToken } from './tokens';

const userId = new Types.ObjectId().toString();

describe('access tokens', () => {
  it('round-trips the user id', () => {
    expect(verifyAccessToken(signAccessToken(userId))).toBe(userId);
  });

  it('expires after ACCESS_TOKEN_TTL_SECONDS (15 minutes by default)', () => {
    const payload = jwt.decode(signAccessToken(userId)) as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(env.ACCESS_TOKEN_TTL_SECONDS);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60);
  });

  it('throws TOKEN_EXPIRED for an expired token', () => {
    const expired = jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 1 }, env.JWT_ACCESS_SECRET);
    expect(() => verifyAccessToken(expired)).toThrow(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
  });

  it.each([
    ['a tampered token', `${signAccessToken(userId)}x`],
    ['a token without a user id', jwt.sign({}, env.JWT_ACCESS_SECRET)],
    ['a token whose subject is not an id', jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: 'admin' })],
  ])('throws UNAUTHENTICATED for %s', (_label, token) => {
    expect(() => verifyAccessToken(token)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });
});

describe('refresh tokens', () => {
  it('are random and 256 bits long', () => {
    const a = generateRefreshToken();
    expect(a).toHaveLength(43);
    expect(generateRefreshToken()).not.toBe(a);
  });

  it('hash deterministically to something other than the token', () => {
    const token = generateRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
