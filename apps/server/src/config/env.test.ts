import { describe, expect, it } from 'vitest';
import { EXAMPLE_JWT_SECRET, parseEnv } from './env';

const valid = {
  NODE_ENV: 'production',
  PORT: '8080',
  MONGODB_URI: 'mongodb://localhost:27017/studibrowse',
  CLIENT_ORIGIN: 'https://studibrowse.app',
  LOG_LEVEL: 'warn',
  JWT_ACCESS_SECRET: 'a-production-secret-of-at-least-32-chars',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  REFRESH_TOKEN_TTL_DAYS: '14',
  BCRYPT_COST: '13',
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'StudiBrowse <hello@studibrowse.app>',
  CLOUDINARY_CLOUD_NAME: 'studibrowse',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'cloudinary-secret',
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
        TRUST_PROXY: 0,
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
      TRUST_PROXY: 0,
    });
  });

  it('reads TRUST_PROXY as a hop count', () => {
    const result = parseEnv({ ...valid, TRUST_PROXY: '2' });
    expect(result.ok && result.env.TRUST_PROXY).toBe(2);
    expect(parseEnv({ ...valid, TRUST_PROXY: 'true' }).ok).toBe(false);
  });

  it('requires an https CLIENT_ORIGIN in production only', () => {
    const result = parseEnv({ ...valid, CLIENT_ORIGIN: 'http://studibrowse.app' });
    expect(result).toEqual({ ok: false, problems: ['CLIENT_ORIGIN must use https in production'] });
    expect(parseEnv({ ...valid, NODE_ENV: 'development', CLIENT_ORIGIN: 'http://localhost:5173' }).ok).toBe(
      true,
    );
  });

  it('refuses the .env.example JWT secret in production', () => {
    const result = parseEnv({ ...valid, JWT_ACCESS_SECRET: EXAMPLE_JWT_SECRET });
    expect(result.ok).toBe(false);
    expect(parseEnv({ ...valid, NODE_ENV: 'development', JWT_ACCESS_SECRET: EXAMPLE_JWT_SECRET }).ok).toBe(
      true,
    );
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

  it.each([
    'GOOGLE_CLIENT_ID',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ])('requires %s in production', (key) => {
    const result = parseEnv({ ...valid, [key]: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([`${key} is required in production`]);
  });

  it('leaves the Google, email and Cloudinary settings optional outside production', () => {
    const result = parseEnv({
      NODE_ENV: 'development',
      MONGODB_URI: valid.MONGODB_URI,
      CLIENT_ORIGIN: valid.CLIENT_ORIGIN,
      JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET,
      GOOGLE_CLIENT_ID: '',
      CLOUDINARY_API_SECRET: '',
    });
    expect(result.ok && result.env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(result.ok && result.env.CLOUDINARY_API_SECRET).toBeUndefined();
  });

  it('rejects a MongoDB URI with the wrong scheme', () => {
    const result = parseEnv({ ...valid, MONGODB_URI: 'http://localhost:27017' });
    expect(result.ok).toBe(false);
  });

  it('leaves Sentry optional, even in production', () => {
    const result = parseEnv({ ...valid, SENTRY_DSN: '' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.env.SENTRY_DSN).toBeUndefined();
    expect(result.ok && result.env.release).toBeUndefined();
  });

  it('rejects a Sentry DSN that is not a URL', () => {
    const result = parseEnv({ ...valid, SENTRY_DSN: 'not a dsn' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatch(/^SENTRY_DSN /);
  });

  it('takes the release from SENTRY_RELEASE, else from the commit Render deployed', () => {
    const fromCommit = parseEnv({ ...valid, RENDER_GIT_COMMIT: 'abc123' });
    expect(fromCommit.ok && fromCommit.env.release).toBe('abc123');
    const explicit = parseEnv({ ...valid, RENDER_GIT_COMMIT: 'abc123', SENTRY_RELEASE: 'v1.2.0' });
    expect(explicit.ok && explicit.env.release).toBe('v1.2.0');
  });
});
