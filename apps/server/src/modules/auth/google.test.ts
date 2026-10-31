import type { Express } from 'express';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { usernameSchema } from '@studibrowse/shared';
import { createApp } from '../../app';
import { refreshCookie, refreshSetCookie } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { User } from '../users/user.model';
import { googleTokenInvalid } from './auth.errors';
import type { GoogleProfile, GoogleVerifier } from './google';
import { PasswordResetToken } from './passwordResetToken.model';
import { RefreshToken } from './refreshToken.model';

useTestDatabase();

const alex: GoogleProfile = { sub: 'google-alex', email: 'alex.smith@gmail.com', name: 'Alex Smith' };

/** Stands in for Google: each credential string maps to a verified profile; anything else is invalid. */
const fakeGoogle = new Map<string, GoogleProfile>();
const verifyGoogleToken: GoogleVerifier = async (credential) => {
  const profile = fakeGoogle.get(credential);
  if (!profile) throw googleTokenInvalid();
  return profile;
};

let app: Express;
beforeEach(() => {
  fakeGoogle.clear();
  fakeGoogle.set('alex-token', alex);
  app = createApp({
    isDatabaseConnected: () => true,
    clientOrigin: 'http://localhost:5173',
    verifyGoogleToken,
  });
});

function google(credential: string, keepLoggedIn?: boolean) {
  return request(app).post('/api/auth/google').send({ credential, keepLoggedIn });
}

function expectNoSecrets(res: Response): void {
  expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|googleId|tokenHash|refreshToken|google-alex/);
}

describe('POST /api/auth/google', () => {
  it('creates a new account (201) with a suggested username, ready for onboarding', async () => {
    const res = await google('alex-token');
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      name: 'Alex Smith',
      username: 'alexsmith',
      email: 'alex.smith@gmail.com',
      onboardedAt: null,
    });
    expect(refreshSetCookie(res)).toMatch(/Max-Age=2592000/);
    expectNoSecrets(res);

    const user = await User.findOne({ email: alex.email }).select('+passwordHash');
    expect(user?.googleId).toBe('google-alex');
    expect(user?.passwordHash).toBeUndefined();
  });

  it('signs a returning Google user in (200) without creating another account', async () => {
    await google('alex-token');
    const res = await google('alex-token');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alexsmith');
    expect(await User.countDocuments()).toBe(1);
  });

  it('finds a returning user by Google id even after their email changed', async () => {
    await google('alex-token');
    fakeGoogle.set('renamed-token', { ...alex, email: 'alex@newmail.com' });
    const res = await google('renamed-token');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alex.smith@gmail.com');
  });

  it('sets a session cookie when keepLoggedIn is false', async () => {
    const res = await google('alex-token', false);
    expect(refreshSetCookie(res)).not.toMatch(/Max-Age|Expires/);
  });

  it('adds digits to the suggested username when the plain one is taken', async () => {
    await User.create({ name: 'Other', username: 'alexsmith', email: 'other@example.com' });
    const res = await google('alex-token');
    expect(res.status).toBe(201);
    expect(res.body.user.username).toMatch(/^alexsmith\d{3}$/);
    expect(usernameSchema.safeParse(res.body.user.username).success).toBe(true);
  });

  it('falls back to the email for the name when Google has none', async () => {
    fakeGoogle.set('nameless-token', { sub: 'google-n', email: 'maya.lee@gmail.com', name: undefined });
    const res = await google('nameless-token');
    expect(res.body.user.name).toBe('maya.lee');
  });

  describe('linking to an account with the same email', () => {
    const password = 'focus-time-1';
    let oldSession: string;

    beforeEach(async () => {
      const signup = await request(app).post('/api/auth/signup').send({
        name: 'Alex S',
        username: 'alex_s',
        email: 'Alex.Smith@gmail.com',
        password,
        acceptTerms: true,
      });
      oldSession = refreshCookie(signup);
      await request(app).post('/api/auth/forgot').send({ email: alex.email });
    });

    it('signs into the existing account (200) and links Google to it', async () => {
      const res = await google('alex-token');
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ username: 'alex_s', name: 'Alex S' });
      expect(await User.countDocuments()).toBe(1);
      expect((await User.findOne())?.googleId).toBe('google-alex');
    });

    it('removes the unverified password and every older session and reset link', async () => {
      const res = await google('alex-token');
      const login = await request(app).post('/api/auth/login').send({ identifier: 'alex_s', password });
      expect(login.status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').set('Cookie', oldSession)).status).toBe(401);
      expect(await PasswordResetToken.countDocuments()).toBe(0);

      // Only the session Google just started is left.
      expect(await RefreshToken.countDocuments()).toBe(1);
      expect((await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(res))).status).toBe(
        200,
      );
    });
  });

  it('rejects an email already linked to a different Google account with 409', async () => {
    await google('alex-token');
    fakeGoogle.set('impostor-token', { ...alex, sub: 'google-other' });
    const res = await google('impostor-token');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GOOGLE_ACCOUNT_CONFLICT');
  });

  it('rejects a token Google does not accept with 401 and no cookie', async () => {
    const res = await google('forged-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects a missing credential with 400', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 503 when Google sign-in is not configured', async () => {
    // No verifier passed: the default reads GOOGLE_CLIENT_ID, which the test env leaves unset.
    app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });
    const res = await google('alex-token');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
  });
});
