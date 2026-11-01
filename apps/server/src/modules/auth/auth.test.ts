import bcrypt from 'bcrypt';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignupInput } from '@studibrowse/shared';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { refreshCookie, refreshSetCookie, setCookieHeaders } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { User } from '../users/user.model';
import { REFRESH_COOKIE } from './auth.cookies';
import { RefreshToken } from './refreshToken.model';

useTestDatabase();

const validSignup = {
  name: 'Alex Smith',
  username: 'alexsmith',
  email: 'alex@example.com',
  password: 'focus-time-1',
  acceptTerms: true,
} satisfies SignupInput;

// A fresh app per test, so the signup/login rate limiter starts from zero each time.
let app: Express;
beforeEach(() => {
  app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });
});

function signUp(overrides: Partial<SignupInput> = {}) {
  return request(app)
    .post('/api/auth/signup')
    .send({ ...validSignup, ...overrides });
}

function logIn(identifier: string, password: string, keepLoggedIn?: boolean) {
  return request(app).post('/api/auth/login').send({ identifier, password, keepLoggedIn });
}

function refreshWith(cookie?: string) {
  const req = request(app).post('/api/auth/refresh');
  return cookie ? req.set('Cookie', cookie) : req;
}

function me(accessToken: string) {
  return request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
}

/** Response bodies must never carry a password hash, a Google id or a refresh token. */
function expectNoSecrets(res: Response): void {
  const body = JSON.stringify(res.body);
  expect(body).not.toMatch(/passwordHash|googleId|tokenHash|refreshToken/);
  for (const line of setCookieHeaders(res)) {
    const token = line.split(';')[0]!.split('=')[1];
    if (token) expect(body).not.toContain(token);
  }
}

describe('POST /api/auth/signup', () => {
  it('creates the account, returns an access token and the public user, and sets the refresh cookie', async () => {
    const res = await signUp();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      name: 'Alex Smith',
      username: 'alexsmith',
      email: 'alex@example.com',
      subjects: [],
      weeklyGoalMins: 600,
      timerDefaults: { focusMins: 25, shortBreakMins: 5, longBreakMins: 15, roundsBeforeLong: 4 },
      streak: { current: 0, longest: 0 },
      lastStudiedAt: null,
      following: [],
      notificationPrefs: { roomOpened: true, roomFull: true, memberJoined: true, roundEnded: true },
      onboardedAt: null,
    });
    expect(res.body.user.avatarColor).toMatch(/^(green|gold|blue|purple|red|olive)$/);
    expectNoSecrets(res);
  });

  it('sets an httpOnly, Secure, SameSite=Lax cookie scoped to /api/auth that lasts 30 days', async () => {
    const cookie = refreshSetCookie(await signUp());
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\/api\/auth/);
    expect(cookie).toMatch(`; Max-Age=${30 * 24 * 60 * 60}`);
  });

  it('sets a session cookie when "keep me logged in" is off', async () => {
    const cookie = refreshSetCookie(await signUp({ keepLoggedIn: false }));
    expect(cookie).not.toMatch(/Max-Age|Expires/);
  });

  it('stores a bcrypt hash, never the password, and stores the refresh token hashed', async () => {
    const res = await signUp();
    const user = await User.findOne({ email: 'alex@example.com' }).select('+passwordHash');
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(validSignup.password, user!.passwordHash!)).toBe(true);

    const rawToken = refreshCookie(res).split('=')[1]!;
    expect(await RefreshToken.exists({ tokenHash: rawToken })).toBeNull();
    expect(await RefreshToken.countDocuments({ userId: user!._id })).toBe(1);
  });

  it('normalises the email and username', async () => {
    const res = await signUp({ email: '  Alex@Example.COM ', username: 'AlexSmith' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'alex@example.com', username: 'alexsmith' });
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await signUp();
    const res = await signUp({ username: 'someoneelse', email: 'ALEX@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a username that differs only in case with 409 USERNAME_TAKEN', async () => {
    await signUp();
    const res = await signUp({ username: 'AlexSmith', email: 'other@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'USERNAME_TAKEN', message: '@alexsmith is taken.' });
  });

  it.each([
    ['email', { username: 'someoneelse' }, 'EMAIL_TAKEN'],
    ['username', { email: 'other@example.com' }, 'USERNAME_TAKEN'],
  ])('maps a unique-index race on the %s to 409 as well', async (_field, overrides, code) => {
    await signUp();
    // A second sign-up that passed the pre-check before the first one was saved.
    const exists = vi.spyOn(User, 'exists').mockResolvedValue(null);
    try {
      const res = await signUp(overrides);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(code);
    } finally {
      exists.mockRestore();
    }
  });

  it.each([
    ['a weak password', { password: 'onlyletters' }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a username with spaces', { username: 'alex smith' }],
    ['terms not accepted', { acceptTerms: false as unknown as true }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, overrides) => {
    const res = await signUp(overrides);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await signUp();
  });

  it('logs in with an email', async () => {
    const res = await logIn('alex@example.com', validSignup.password);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.username).toBe('alexsmith');
    expectNoSecrets(res);
  });

  it('logs in with a username in any case', async () => {
    const res = await logIn('AlexSmith', validSignup.password);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alex@example.com');
  });

  it('sets a session cookie by default and a 30-day cookie when "keep me logged in" is on', async () => {
    const session = refreshSetCookie(await logIn('alexsmith', validSignup.password));
    expect(session).not.toMatch(/Max-Age|Expires/);
    const persistent = refreshSetCookie(await logIn('alexsmith', validSignup.password, true));
    expect(persistent).toMatch(/Max-Age=2592000/);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS and no cookie', async () => {
    const res = await logIn('alex@example.com', 'wrong-password-1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(setCookieHeaders(res)).toEqual([]);
  });

  it('gives an unknown account the same answer as a wrong password', async () => {
    const wrong = await logIn('alex@example.com', 'wrong-password-1');
    const unknown = await logIn('nobody@example.com', 'wrong-password-1');
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejects a Google-only account (no password) like an unknown one', async () => {
    await User.create({ name: 'G', username: 'googler', email: 'g@example.com', googleId: 'google-123' });
    const res = await logIn('g@example.com', 'anything-1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('limits failed attempts per account: the 11th in 15 minutes gets 429 RATE_LIMITED', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await logIn('alexsmith', 'wrong-password-1')).status).toBe(401);
    }
    const blocked = await logIn('AlexSmith', validSignup.password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('counts each account separately and ignores successful logins', async () => {
    for (let i = 0; i < 10; i++) await logIn('someone-else', 'wrong-password-1');
    for (let i = 0; i < 5; i++) {
      expect((await logIn('alexsmith', validSignup.password)).status).toBe(200);
    }
    expect((await logIn('someone-else', 'wrong-password-1')).status).toBe(429);
  });

  it('rejects an empty body with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the token: returns a new access token and sets a new cookie', async () => {
    const first = refreshCookie(await signUp());
    const res = await refreshWith(first);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.username).toBe('alexsmith');
    const second = refreshCookie(res);
    expect(second).not.toBe(first);
    expectNoSecrets(res);

    // The new token works in turn.
    expect((await refreshWith(second)).status).toBe(200);
  });

  it('treats a reused token as theft: 401 REFRESH_TOKEN_REUSED and the whole session is revoked', async () => {
    const first = refreshCookie(await signUp());
    const second = refreshCookie(await refreshWith(first));

    const replay = await refreshWith(first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The token issued by the legitimate rotation is gone too.
    const afterReplay = await refreshWith(second);
    expect(afterReplay.status).toBe(401);
    expect(afterReplay.body.error.code).toBe('UNAUTHENTICATED');
    expect(await RefreshToken.countDocuments()).toBe(0);
  });

  it('only revokes the session that was replayed, not other devices', async () => {
    const laptop = refreshCookie(await signUp());
    const phone = refreshCookie(await logIn('alexsmith', validSignup.password));
    await refreshWith(laptop);
    await refreshWith(laptop);
    expect((await refreshWith(phone)).status).toBe(200);
  });

  it('keeps a session cookie a session cookie across rotations', async () => {
    const first = refreshCookie(await signUp({ keepLoggedIn: false }));
    const res = await refreshWith(first);
    expect(refreshSetCookie(res)).not.toMatch(/Max-Age|Expires/);
  });

  it('rejects a missing cookie with 401', async () => {
    const res = await refreshWith();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown token with 401 and clears the cookie', async () => {
    const res = await refreshWith(`${REFRESH_COOKIE}=made-up-token`);
    expect(res.status).toBe(401);
    expect(refreshSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('rejects an expired refresh token with 401', async () => {
    const cookie = refreshCookie(await signUp());
    await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    const res = await refreshWith(cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects the token of a deleted account with 401', async () => {
    const cookie = refreshCookie(await signUp());
    await User.deleteMany({});
    expect((await refreshWith(cookie)).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    const cookie = refreshCookie(await signUp());
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(refreshSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await RefreshToken.countDocuments()).toBe(0);

    expect((await refreshWith(cookie)).status).toBe(401);
  });

  it('succeeds without a cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const { body } = await signUp();
    const res = await me(body.accessToken);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(body.user);
    expectNoSecrets(res);
  });

  it('works with the access token from a refresh', async () => {
    const refreshed = await refreshWith(refreshCookie(await signUp()));
    expect((await me(refreshed.body.accessToken)).status).toBe(200);
  });

  it('rejects a missing token with 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each([
    ['garbage', 'not-a-jwt'],
    ['a token signed with another secret', jwt.sign({}, 'x'.repeat(40), { subject: '0'.repeat(24) })],
    ['an unsigned token', jwt.sign({}, '', { algorithm: 'none', subject: '0'.repeat(24) })],
  ])('rejects %s with 401 UNAUTHENTICATED', async (_label, token) => {
    const res = await me(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired access token with 401 TOKEN_EXPIRED', async () => {
    const { body } = await signUp();
    const expired = jwt.sign(
      { sub: body.user.id, exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_ACCESS_SECRET,
    );
    const res = await me(expired);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects the token of a deleted account with 401', async () => {
    const { body } = await signUp();
    await User.deleteMany({});
    const res = await me(body.accessToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
