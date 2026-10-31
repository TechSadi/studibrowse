import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { RESET_TOKEN_TTL_MINS } from '@studibrowse/shared';
import { createApp } from '../../app';
import { createRecordingEmailService, refreshCookie } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { User } from '../users/user.model';
import { PasswordResetToken } from './passwordResetToken.model';
import { RefreshToken } from './refreshToken.model';

useTestDatabase();

const account = {
  name: 'Alex Smith',
  username: 'alexsmith',
  email: 'alex@example.com',
  password: 'focus-time-1',
  acceptTerms: true,
};
const NEW_PASSWORD = 'brand-new-pass-2';

// A fresh app (and so fresh rate limiters) and an empty outbox per test.
let app: Express;
let email: ReturnType<typeof createRecordingEmailService>;
beforeEach(() => {
  email = createRecordingEmailService();
  app = createApp({
    isDatabaseConnected: () => true,
    clientOrigin: 'http://localhost:5173',
    emailService: email,
  });
});

function signUp() {
  return request(app).post('/api/auth/signup').send(account);
}

function forgot(address: string) {
  return request(app).post('/api/auth/forgot').send({ email: address });
}

function reset(token: string, password = NEW_PASSWORD) {
  return request(app).post('/api/auth/reset').send({ token, password });
}

function logIn(password: string) {
  return request(app).post('/api/auth/login').send({ identifier: account.email, password });
}

/** The raw token from the link in the last email sent. */
function tokenFromLastEmail(): string {
  const text = email.sent.at(-1)?.text ?? '';
  const match = /\/reset-password#token=([\w-]+)/.exec(text);
  if (!match) throw new Error('No reset link in the last email');
  return match[1]!;
}

describe('POST /api/auth/forgot', () => {
  beforeEach(async () => {
    await signUp();
  });

  it('emails a reset link that points at the web app, with the token in the URL fragment', async () => {
    const res = await forgot('alex@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(email.sent).toHaveLength(1);
    const [message] = email.sent;
    expect(message!.to).toBe('alex@example.com');
    expect(message!.text).toContain('http://localhost:5173/reset-password#token=');
    expect(message!.html).toContain('http://localhost:5173/reset-password#token=');
    expect(message!.text).toContain(`${RESET_TOKEN_TTL_MINS} minutes`);
  });

  it('answers an unknown email exactly like a known one, and sends nothing', async () => {
    const known = await forgot('alex@example.com');
    const unknown = await forgot('nobody@example.com');
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(email.sent).toHaveLength(1);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
  });

  it('normalises the email', async () => {
    await forgot('  Alex@Example.COM ');
    expect(email.sent).toHaveLength(1);
  });

  it('stores only a hash of the token, expiring in 30 minutes', async () => {
    const before = Date.now();
    await forgot('alex@example.com');
    const token = tokenFromLastEmail();

    const stored = await PasswordResetToken.findOne();
    expect(stored!.tokenHash).not.toContain(token);
    expect(await PasswordResetToken.exists({ tokenHash: token })).toBeNull();
    const ttl = stored!.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
  });

  it('only the newest link works', async () => {
    await forgot('alex@example.com');
    const first = tokenFromLastEmail();
    await forgot('alex@example.com');
    const second = tokenFromLastEmail();

    expect((await reset(first)).body.error.code).toBe('RESET_TOKEN_INVALID');
    expect((await reset(second)).status).toBe(204);
  });

  it('still answers 200 when the email provider fails', async () => {
    app = createApp({
      isDatabaseConnected: () => true,
      clientOrigin: 'http://localhost:5173',
      emailService: { send: () => Promise.reject(new Error('provider down')) },
    });
    const res = await forgot('alex@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sends a link to a Google-only account too, so it can set a password', async () => {
    await User.create({ name: 'G', username: 'googler', email: 'g@example.com', googleId: 'google-1' });
    await forgot('g@example.com');
    expect((await reset(tokenFromLastEmail())).status).toBe(204);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'googler', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('limits each email to 3 requests an hour, known or not', async () => {
    for (const address of ['alex@example.com', 'nobody@example.com']) {
      for (let i = 0; i < 3; i++) expect((await forgot(address)).status).toBe(200);
      const blocked = await forgot(address);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    }
    expect(email.sent).toHaveLength(3);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await forgot('not-an-email');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/reset', () => {
  let sessionCookie: string;
  beforeEach(async () => {
    sessionCookie = refreshCookie(await signUp());
    await forgot('alex@example.com');
  });

  it('sets the new password: it logs in and the old one no longer does', async () => {
    const res = await reset(tokenFromLastEmail());
    expect(res.status).toBe(204);
    expect((await logIn(NEW_PASSWORD)).status).toBe(200);
    expect((await logIn(account.password)).status).toBe(401);
  });

  it('signs the account out everywhere', async () => {
    await request(app).post('/api/auth/login').send({ identifier: 'alexsmith', password: account.password });
    expect(await RefreshToken.countDocuments()).toBe(2);

    await reset(tokenFromLastEmail());
    expect(await RefreshToken.countDocuments()).toBe(0);
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', sessionCookie);
    expect(refresh.status).toBe(401);
  });

  it('works only once', async () => {
    const token = tokenFromLastEmail();
    expect((await reset(token)).status).toBe(204);
    const again = await reset(token, 'another-pass-3');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('RESET_TOKEN_INVALID');
    expect((await logIn(NEW_PASSWORD)).status).toBe(200);
  });

  it('lets only one of two racing requests through', async () => {
    const token = tokenFromLastEmail();
    const results = await Promise.all([reset(token, 'racer-one-pass-1'), reset(token, 'racer-two-pass-2')]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('rejects an expired link', async () => {
    await PasswordResetToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    const res = await reset(tokenFromLastEmail());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');
    expect((await logIn(account.password)).status).toBe(200);
  });

  it('rejects an unknown token', async () => {
    const res = await reset('made-up-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('rejects a weak password and leaves the link usable', async () => {
    const token = tokenFromLastEmail();
    const weak = await reset(token, 'onlyletters');
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    expect((await reset(token)).status).toBe(204);
  });
});
