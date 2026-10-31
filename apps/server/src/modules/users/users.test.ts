import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { User } from './user.model';

useTestDatabase();

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

function check(username: string) {
  return request(app).get('/api/users/username-available').query({ u: username });
}

describe('GET /api/users/username-available', () => {
  beforeEach(async () => {
    await User.create({ name: 'Alex', username: 'alexsmith', email: 'alex@example.com' });
  });

  it('reports a free username as available', async () => {
    const res = await check('mayalee');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it('reports a taken username as unavailable, ignoring case', async () => {
    expect((await check('alexsmith')).body).toEqual({ available: false });
    expect((await check('AlexSmith')).body).toEqual({ available: false });
  });

  it('rejects a malformed username with 400 VALIDATION_ERROR', async () => {
    const res = await check('a b');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing username with 400', async () => {
    const res = await request(app).get('/api/users/username-available');
    expect(res.status).toBe(400);
  });
});

function patchMe(token: string, body: object) {
  return request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send(body);
}

describe('PATCH /api/users/me', () => {
  it('needs a signed-in user', async () => {
    const res = await request(app).patch('/api/users/me').send({ studying: 'Law' });
    expect(res.status).toBe(401);
  });

  it('saves the profile step and returns the updated user', async () => {
    const { user, token } = await createUserWithToken();
    const res = await patchMe(token, {
      avatarColor: 'red',
      studying: ' Computer Science, year 2 ',
      subjects: ['Maths', 'Programming'],
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      avatarColor: 'red',
      studying: 'Computer Science, year 2',
      subjects: ['Maths', 'Programming'],
      onboardedAt: null,
    });
    expect((await User.findById(user.id))?.studying).toBe('Computer Science, year 2');
  });

  it('merges timer defaults field by field', async () => {
    const { token } = await createUserWithToken();
    const res = await patchMe(token, {
      weeklyGoalMins: 900,
      timerDefaults: { focusMins: 50, totalRounds: 6 },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.weeklyGoalMins).toBe(900);
    expect(res.body.user.timerDefaults).toEqual({
      focusMins: 50,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 6,
    });
  });

  it('sets onboardedAt once and keeps the first timestamp', async () => {
    const { user, token } = await createUserWithToken();
    const first = await patchMe(token, { onboarded: true });
    expect(first.status).toBe(200);
    expect(first.body.user.onboardedAt).toEqual(expect.any(String));

    const second = await patchMe(token, { onboarded: true });
    expect(second.body.user.onboardedAt).toBe(first.body.user.onboardedAt);
    expect((await User.findById(user.id))?.onboardedAt?.toISOString()).toBe(first.body.user.onboardedAt);
  });

  it.each([
    ['an empty body', {}],
    ['an unknown field', { email: 'new@example.com' }],
    ['an out-of-range timer', { timerDefaults: { focusMins: 120 } }],
    ['an unknown colour', { avatarColor: 'pink' }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_, body) => {
    const { token } = await createUserWithToken();
    const res = await patchMe(token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST and DELETE /api/users/:id/follow', () => {
  function follow(token: string, id: string) {
    return request(app).post(`/api/users/${id}/follow`).set('Authorization', `Bearer ${token}`);
  }
  function unfollow(token: string, id: string) {
    return request(app).delete(`/api/users/${id}/follow`).set('Authorization', `Bearer ${token}`);
  }

  it('follows and unfollows someone, and both are idempotent', async () => {
    const { token } = await createUserWithToken();
    const { user: maya } = await createUserWithToken({ name: 'Maya Kapoor' });

    expect((await follow(token, maya.id)).body.user.following).toEqual([maya.id]);
    expect((await follow(token, maya.id)).body.user.following).toEqual([maya.id]);

    const res = await unfollow(token, maya.id);
    expect(res.status).toBe(200);
    expect(res.body.user.following).toEqual([]);
    expect((await unfollow(token, maya.id)).status).toBe(200);
  });

  it('needs a signed-in user', async () => {
    const { user: maya } = await createUserWithToken();
    expect((await request(app).post(`/api/users/${maya.id}/follow`)).status).toBe(401);
    expect((await request(app).delete(`/api/users/${maya.id}/follow`)).status).toBe(401);
  });

  it('rejects following yourself with 400 CANNOT_FOLLOW_SELF', async () => {
    const { user, token } = await createUserWithToken();
    const res = await follow(token, user.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_FOLLOW_SELF');
  });

  it('answers 404 USER_NOT_FOUND for an unknown person', async () => {
    const { token } = await createUserWithToken();
    const res = await follow(token, '6650f0c2a1b2c3d4e5f60718');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects a malformed id with 400 VALIDATION_ERROR', async () => {
    const { token } = await createUserWithToken();
    const res = await follow(token, 'not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/users/suggestions', () => {
  function suggestions(token: string) {
    return request(app).get('/api/users/suggestions').set('Authorization', `Bearer ${token}`);
  }
  const onboardedAt = new Date('2026-10-01T10:00:00Z');

  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/users/suggestions')).status).toBe(401);
  });

  it('returns an empty list when there is no one else', async () => {
    const { token } = await createUserWithToken({ onboardedAt });
    const res = await suggestions(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: [] });
  });

  it('lists the most recently active onboarded people, without you or private fields', async () => {
    const { token } = await createUserWithToken({ onboardedAt });
    await createUserWithToken({ name: 'Not onboarded', lastStudiedAt: new Date('2026-10-30') });
    await createUserWithToken({ name: 'Older', onboardedAt, lastStudiedAt: new Date('2026-10-01') });
    await createUserWithToken({ name: 'Newest', onboardedAt, lastStudiedAt: new Date('2026-10-29') });
    await createUserWithToken({ name: 'Never studied', onboardedAt });

    const res = await suggestions(token);
    expect(res.body.users.map((u: { name: string }) => u.name)).toEqual(['Newest', 'Older', 'Never studied']);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(
      ['avatarColor', 'id', 'name', 'studying', 'subjects', 'username'].sort(),
    );
  });

  it('returns at most 5 people', async () => {
    const { token } = await createUserWithToken({ onboardedAt });
    for (let i = 0; i < 7; i++) await createUserWithToken({ onboardedAt });
    expect((await suggestions(token)).body.users).toHaveLength(5);
  });
});

describe('GET /api/users/me/following', () => {
  function following(token: string) {
    return request(app).get('/api/users/me/following').set('Authorization', `Bearer ${token}`);
  }
  function follow(token: string, id: string) {
    return request(app).post(`/api/users/${id}/follow`).set('Authorization', `Bearer ${token}`);
  }

  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/users/me/following')).status).toBe(401);
  });

  it('returns an empty list when you follow no one', async () => {
    const { token } = await createUserWithToken();
    const res = await following(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: [] });
  });

  it('lists the people you follow in the order you followed them, without private fields', async () => {
    const { token } = await createUserWithToken();
    const { user: maya } = await createUserWithToken({ name: 'Maya Kapoor' });
    const { user: jordan } = await createUserWithToken({ name: 'Jordan Lee' });
    await follow(token, jordan.id);
    await follow(token, maya.id);

    const res = await following(token);
    expect(res.body.users.map((u: { name: string }) => u.name)).toEqual(['Jordan Lee', 'Maya Kapoor']);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(['avatarColor', 'id', 'name', 'username']);
  });

  it('leaves out people whose accounts were deleted', async () => {
    const { token } = await createUserWithToken();
    const { user: maya } = await createUserWithToken({ name: 'Maya Kapoor' });
    const { user: gone } = await createUserWithToken({ name: 'Gone' });
    await follow(token, maya.id);
    await follow(token, gone.id);
    await User.deleteOne({ _id: gone.id });

    expect((await following(token)).body.users.map((u: { id: string }) => u.id)).toEqual([maya.id]);
  });
});
