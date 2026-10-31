import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const valid = {
  NODE_ENV: 'production',
  PORT: '8080',
  MONGODB_URI: 'mongodb://localhost:27017/studibrowse',
  CLIENT_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'warn',
  JWT_ACCESS_SECRET: 'a-production-secret-of-at-least-32-chars',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  REFRESH_TOKEN_TTL_DAYS: '14',
  BCRYPT_COST: '13',
};

describe('parseEnv', () => {
  it('parses valid values and coerces numbers', () => {
    const result = parseEnv(valid);
    expect(result).toEqual({
      ok: true,
      env: {
        ...valid,
        PORT: 8080,
        ACCESS_TOKEN_TTL_SECONDS: 600,
        REFRESH_TOKEN_TTL_DAYS: 14,
        BCRYPT_COST: 13,
      },
    });
  });

  it('defaults NODE_ENV, PORT, LOG_LEVEL and the auth settings', () => {
    const result = parseEnv({
      MONGODB_URI: valid.MONGODB_URI,
      CLIENT_ORIGIN: valid.CLIENT_ORIGIN,
      JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET,
    });
    expect(result.ok && result.env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      BCRYPT_COST: 12,
    });
  });

  it('rejects a short JWT secret', () => {
    const result = parseEnv({ ...valid, JWT_ACCESS_SECRET: 'too-short' });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    const result = parseEnv({ ...valid, LOG_LEVEL: 'verbose' });
    expect(result.ok).toBe(false);
  });

  it('names every missing variable', () => {
    const result = parseEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]).toMatch(/^MONGODB_URI /);
    expect(result.problems[1]).toMatch(/^CLIENT_ORIGIN /);
    expect(result.problems[2]).toMatch(/^JWT_ACCESS_SECRET /);
  });

  it('rejects a MongoDB URI with the wrong scheme', () => {
    const result = parseEnv({ ...valid, MONGODB_URI: 'http://localhost:27017' });
    expect(result.ok).toBe(false);
  });
});
