import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { User } from './user.model';
import { toFollowListUser, toPublicUser, toSuggestedUser } from './user.serializer';

describe('toPublicUser', () => {
  const followed = new Types.ObjectId();
  const user = new User({
    name: 'Alex Smith',
    username: 'alexsmith',
    email: 'alex@example.com',
    passwordHash: '$2b$12$secret',
    googleId: 'google-123',
    avatarColor: 'blue',
    subjects: ['Maths'],
    following: [followed],
    lastStudiedAt: new Date('2026-10-01T10:00:00Z'),
    createdAt: new Date('2026-09-01T10:00:00Z'),
  });

  it('never includes the password hash or the Google id', () => {
    const json = JSON.stringify(toPublicUser(user));
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('$2b$12$secret');
    expect(json).not.toContain('google-123');
  });

  it('returns exactly the public fields, with ids and dates as strings', () => {
    const publicUser = toPublicUser(user);
    expect(Object.keys(publicUser).sort()).toEqual(
      [
        'avatarColor',
        'createdAt',
        'email',
        'following',
        'googleLinked',
        'hasPassword',
        'id',
        'lastStudiedAt',
        'name',
        'notificationPrefs',
        'onboardedAt',
        'passwordChangedAt',
        'privacy',
        'streak',
        'studying',
        'subjects',
        'timeZone',
        'timerDefaults',
        'username',
        'weeklyGoalMins',
      ].sort(),
    );
    expect(publicUser).toMatchObject({
      id: user.id,
      following: [followed.toString()],
      lastStudiedAt: '2026-10-01T10:00:00.000Z',
      timeZone: 'UTC',
      onboardedAt: null,
      privacy: { showStudying: true, showStats: true },
      createdAt: '2026-09-01T10:00:00.000Z',
      googleLinked: true,
      passwordChangedAt: null,
    });
  });

  it.each([
    ['a password account', {}, true],
    ['a Google-only account', { googleId: 'g-1' }, false],
    ['a Google account that set a password', { googleId: 'g-1', passwordChangedAt: new Date() }, true],
  ])('works out hasPassword for %s', (_, fields, expected) => {
    const account = new User({
      name: 'A',
      username: 'aaa',
      email: 'a@example.com',
      createdAt: new Date(),
      ...fields,
    });
    expect(toPublicUser(account).hasPassword).toBe(expected);
  });
});

describe('toSuggestedUser', () => {
  it('returns only what a suggestion row shows', () => {
    const user = new User({
      name: 'Maya Kapoor',
      username: 'mayak',
      email: 'maya@example.com',
      passwordHash: '$2b$12$secret',
      avatarColor: 'gold',
      studying: 'Pharmacy, year 3',
      subjects: ['Exam prep'],
    });
    expect(toSuggestedUser(user)).toEqual({
      id: user.id,
      name: 'Maya Kapoor',
      username: 'mayak',
      avatarColor: 'gold',
      studying: 'Pharmacy, year 3',
      subjects: ['Exam prep'],
    });
  });
});

describe('privacy', () => {
  const user = new User({
    name: 'Maya Kapoor',
    username: 'mayak',
    email: 'maya@example.com',
    avatarColor: 'gold',
    studying: 'Pharmacy, year 3',
    privacy: { showStudying: false },
    createdAt: new Date('2026-09-01T10:00:00Z'),
  });

  it('hides a hidden "studying" line from suggestions', () => {
    expect(toSuggestedUser(user).studying).toBe('');
  });

  it('hides it from follower lists too, and says whether the viewer follows them', () => {
    expect(toFollowListUser(user, new Set([user.id as string]))).toEqual({
      id: user.id,
      name: 'Maya Kapoor',
      username: 'mayak',
      avatarColor: 'gold',
      studying: '',
      isFollowing: true,
    });
  });

  it('still shows it to the user themselves', () => {
    expect(toPublicUser(user).studying).toBe('Pharmacy, year 3');
  });
});
