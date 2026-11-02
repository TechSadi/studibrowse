import { describe, expect, it } from 'vitest';
import { followListQuerySchema, updateMeSchema, userIdParamsSchema, usernameParamsSchema } from './users';

describe('updateMeSchema', () => {
  it('accepts every onboarding field', () => {
    const body = {
      avatarColor: 'red',
      studying: '  Computer Science, year 2 ',
      subjects: ['Maths', 'Programming'],
      weeklyGoalMins: 900,
      timerDefaults: { focusMins: 50, shortBreakMins: 10, totalRounds: 6 },
      onboarded: true,
    };
    expect(updateMeSchema.parse(body)).toEqual({ ...body, studying: 'Computer Science, year 2' });
  });

  it('accepts a single field', () => {
    expect(updateMeSchema.parse({ weeklyGoalMins: 300 })).toEqual({ weeklyGoalMins: 300 });
  });

  it('rejects an empty body', () => {
    expect(updateMeSchema.safeParse({}).success).toBe(false);
  });

  it('accepts IANA time zones and UTC', () => {
    expect(updateMeSchema.parse({ timeZone: 'America/Los_Angeles' })).toEqual({
      timeZone: 'America/Los_Angeles',
    });
    expect(updateMeSchema.parse({ timeZone: 'UTC' })).toEqual({ timeZone: 'UTC' });
  });

  it('accepts part of the privacy settings', () => {
    expect(updateMeSchema.parse({ privacy: { showStats: false } })).toEqual({
      privacy: { showStats: false },
    });
  });

  it('trims and de-duplicates subjects', () => {
    expect(updateMeSchema.parse({ subjects: [' Maths', 'Maths ', 'Law'] }).subjects).toEqual([
      'Maths',
      'Law',
    ]);
  });

  it.each([
    ['an unknown avatar colour', { avatarColor: 'pink' }],
    ['a long "studying" note', { studying: 'x'.repeat(81) }],
    ['too many subjects', { subjects: Array.from({ length: 11 }, (_, i) => `S${i}`) }],
    ['an empty subject', { subjects: ['  '] }],
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
    ['a time zone that is too long', { timeZone: 'x'.repeat(65) }],
    ['a weekly goal under an hour', { weeklyGoalMins: 30 }],
    ['a weekly goal over 40 hours', { weeklyGoalMins: 41 * 60 }],
    ['a fractional weekly goal', { weeklyGoalMins: 90.5 }],
    ['focus under 5 minutes', { timerDefaults: { focusMins: 4 } }],
    ['focus over 90 minutes', { timerDefaults: { focusMins: 95 } }],
    ['more than 12 rounds', { timerDefaults: { totalRounds: 13 } }],
    ['an unknown timer field', { timerDefaults: { autoStart: true } }],
    ['onboarded: false', { onboarded: false }],
    ['an unknown privacy setting', { privacy: { showEmail: true } }],
    ['a non-boolean privacy setting', { privacy: { showStats: 'no' } }],
    ['fields with their own flow', { email: 'new@example.com' }],
    ['a raw onboardedAt', { onboardedAt: '2026-01-01T00:00:00Z' }],
  ])('rejects %s', (_, body) => {
    expect(updateMeSchema.safeParse(body).success).toBe(false);
  });
});

describe('userIdParamsSchema', () => {
  it('accepts an ObjectId', () => {
    expect(userIdParamsSchema.safeParse({ id: '6650f0c2a1b2c3d4e5f60718' }).success).toBe(true);
  });

  it.each(['me', '123', '6650f0c2a1b2c3d4e5f6071z'])('rejects %j', (id) => {
    expect(userIdParamsSchema.safeParse({ id }).success).toBe(false);
  });
});

describe('usernameParamsSchema', () => {
  it('lowercases the username', () => {
    expect(usernameParamsSchema.parse({ username: 'MayaK' })).toEqual({ username: 'mayak' });
  });

  it.each(['ab', 'has space', 'x'.repeat(21)])('rejects %j', (username) => {
    expect(usernameParamsSchema.safeParse({ username }).success).toBe(false);
  });
});

describe('followListQuerySchema', () => {
  it('defaults the page size', () => {
    expect(followListQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('coerces the limit from the query string', () => {
    expect(followListQuerySchema.parse({ limit: '5', cursor: 'abc' })).toEqual({ limit: 5, cursor: 'abc' });
  });

  it.each(['0', '21', '2.5'])('rejects a limit of %s', (limit) => {
    expect(followListQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});
