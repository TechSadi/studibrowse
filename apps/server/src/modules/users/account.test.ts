import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createUserWithToken, refreshCookie, refreshSetCookie } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { PasswordResetToken } from '../auth/passwordResetToken.model';
import { RefreshToken } from '../auth/refreshToken.model';
import { Message } from '../chat/message.model';
import { Notification } from '../notifications/notification.model';
import { Session } from '../sessions/session.model';
import { deleteAccount } from './accountDeletion.service';
import { User } from './user.model';

useTestDatabase();

const PASSWORD = 'focus-time-1';

// A fresh app per test, so rate limiters start from zero.
let app: Express;
let onAccountDeleted: ReturnType<typeof vi.fn<(userId: string) => void>>;
beforeEach(() => {
  onAccountDeleted = vi.fn<(userId: string) => void>();
  app = createApp({
    isDatabaseConnected: () => true,
    clientOrigin: 'http://localhost:5173',
    onAccountDeleted,
  });
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function userWithPassword(overrides: Record<string, unknown> = {}) {
  // A low cost keeps the tests fast; compare() reads the cost from the hash.
  return createUserWithToken({ passwordHash: await bcrypt.hash(PASSWORD, 4), ...overrides });
}

describe('PATCH /api/users/me (Settings › Account and Notifications)', () => {
  it('changes the name and username', async () => {
    const { user, token } = await createUserWithToken();
    const res = await request(app)
      .patch('/api/users/me')
      .set(auth(token))
      .send({ name: ' Alex Smith ', username: 'AlexS' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Alex Smith', username: 'alexs' });
    expect((await User.findById(user.id))?.username).toBe('alexs');
  });

  it('keeps your own username without a conflict', async () => {
    const { user, token } = await createUserWithToken();
    const res = await request(app).patch('/api/users/me').set(auth(token)).send({ username: user.username });
    expect(res.status).toBe(200);
  });

  it('refuses a username someone else has with 409 USERNAME_TAKEN', async () => {
    const { user: other } = await createUserWithToken();
    const { token } = await createUserWithToken();
    const res = await request(app).patch('/api/users/me').set(auth(token)).send({ username: other.username });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('merges notification settings per field', async () => {
    const { token } = await createUserWithToken();
    const res = await request(app)
      .patch('/api/users/me')
      .set(auth(token))
      .send({ notificationPrefs: { memberJoined: false } });
    expect(res.status).toBe(200);
    expect(res.body.user.notificationPrefs).toEqual({
      roomOpened: true,
      roomFull: true,
      memberJoined: false,
      roundEnded: true,
    });
  });
});

function changeEmail(token: string, body: object) {
  return request(app).patch('/api/users/me/email').set(auth(token)).send(body);
}

describe('PATCH /api/users/me/email', () => {
  it('needs a signed-in user', async () => {
    const res = await request(app).patch('/api/users/me/email').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('changes the email with the right password, and you can log in with it', async () => {
    const { user, token } = await userWithPassword();
    const res = await changeEmail(token, { email: 'New@Example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('new@example.com');
    expect((await User.findById(user.id))?.email).toBe('new@example.com');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'new@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('refuses a wrong password with 400 WRONG_PASSWORD and changes nothing', async () => {
    const { user, token } = await userWithPassword();
    const res = await changeEmail(token, { email: 'new@example.com', password: 'not-it-1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
    expect((await User.findById(user.id))?.email).toBe(user.email);
  });

  it('refuses an account without a password', async () => {
    const { token } = await createUserWithToken();
    const res = await changeEmail(token, { email: 'new@example.com', password: PASSWORD });
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
  });

  it('refuses a Google-linked account with 400 EMAIL_MANAGED_BY_GOOGLE', async () => {
    const { token } = await userWithPassword({ googleId: 'google-1' });
    const res = await changeEmail(token, { email: 'new@example.com', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_MANAGED_BY_GOOGLE');
  });

  it('refuses an email another account uses with 409 EMAIL_TAKEN', async () => {
    const { user: other } = await createUserWithToken();
    const { token } = await userWithPassword();
    const res = await changeEmail(token, { email: other.email, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('limits wrong passwords per account', async () => {
    const { token } = await userWithPassword();
    for (let i = 0; i < 10; i += 1) {
      expect((await changeEmail(token, { email: 'new@example.com', password: 'wrong-1' })).status).toBe(400);
    }
    const res = await changeEmail(token, { email: 'new@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
  });
});

/** Someone with a session, a follower, a notification, a chat message and a logged session. */
async function seedAccount() {
  const signup = await request(app).post('/api/auth/signup').send({
    name: 'Alex Smith',
    username: 'alexsmith',
    email: 'alex@example.com',
    password: PASSWORD,
    acceptTerms: true,
  });
  const userId = signup.body.user.id as string;
  const token = signup.body.accessToken as string;
  const cookie = refreshCookie(signup);
  const { user: follower } = await createUserWithToken({ following: [userId] });
  const roomId = new Types.ObjectId();
  await Notification.create({
    userId,
    type: 'roomStarted',
    roomId,
    roomName: 'Finals week focus',
    text: 'Maya opened a room',
    createdAt: new Date(),
    groupStartedAt: new Date(),
  });
  await PasswordResetToken.create({ userId, tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000) });
  const message = await Message.create({ roomId, userId, text: 'See you after the break' });
  const session = await Session.create({
    roomId,
    roomName: 'Finals week focus',
    startedAt: new Date(),
    participants: [
      { userId, focusedMins: 25 },
      { userId: follower._id, focusedMins: 25 },
    ],
  });
  return { userId, token, cookie, follower, message, session };
}

function deleteMe(token: string, body: object) {
  return request(app).delete('/api/users/me').set(auth(token)).send(body);
}

describe('DELETE /api/users/me', () => {
  it('needs a signed-in user', async () => {
    expect((await request(app).delete('/api/users/me').send({ username: 'alexsmith' })).status).toBe(401);
  });

  it('refuses the wrong username with 400 CONFIRMATION_MISMATCH and deletes nothing', async () => {
    const { userId, token } = await seedAccount();
    const res = await deleteMe(token, { username: 'someoneelse' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONFIRMATION_MISMATCH');
    expect(await User.exists({ _id: userId })).toBeTruthy();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it('deletes the account, its follows, notifications and tokens, and anonymises its messages', async () => {
    const { userId, token, cookie, follower, message, session } = await seedAccount();
    // Case and spaces don't matter, like everywhere else a username is typed.
    const res = await deleteMe(token, { username: ' AlexSmith ' });
    expect(res.status).toBe(204);
    expect(refreshSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(onAccountDeleted).toHaveBeenCalledWith(userId);

    expect(await User.exists({ _id: userId })).toBeNull();
    expect((await User.findById(follower.id))?.following).toEqual([]);
    expect(await Notification.countDocuments({ userId })).toBe(0);
    expect(await RefreshToken.countDocuments({ userId })).toBe(0);
    expect(await PasswordResetToken.countDocuments({ userId })).toBe(0);

    const kept = await Message.findById(message.id).lean();
    expect(kept).toMatchObject({ text: 'See you after the break', userId: null });
    // The session log stays in everyone's history.
    expect((await Session.findById(session.id).lean())?.participants).toHaveLength(2);

    // The old cookie can't sign back in.
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('leaves other people alone', async () => {
    const { userId, follower } = await seedAccount();
    const other = await createUserWithToken({ username: 'mayak', following: [userId] });
    expect((await deleteMe(other.token, { username: 'mayak' })).status).toBe(204);
    expect(await User.exists({ _id: other.user._id })).toBeNull();
    expect(await User.exists({ _id: userId })).toBeTruthy();
    expect((await User.findById(follower.id))?.following.map(String)).toEqual([userId]);
  });
});

describe('deleteAccount', () => {
  it('treats a second call as signed out, since the account is gone', async () => {
    const { userId } = await seedAccount();
    await deleteAccount(userId, { username: 'alexsmith' });
    await expect(deleteAccount(userId, { username: 'alexsmith' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
