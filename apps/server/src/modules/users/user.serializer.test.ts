import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { User } from './user.model';
import { toPublicUser } from './user.serializer';

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
        'id',
        'lastStudiedAt',
        'name',
        'notificationPrefs',
        'onboardedAt',
        'streak',
        'subjects',
        'timerDefaults',
        'username',
        'weeklyGoalMins',
      ].sort(),
    );
    expect(publicUser).toMatchObject({
      id: user.id,
      following: [followed.toString()],
      lastStudiedAt: '2026-10-01T10:00:00.000Z',
      onboardedAt: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    });
  });
});
