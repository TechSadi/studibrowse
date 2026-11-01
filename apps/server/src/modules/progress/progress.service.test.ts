import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Session } from '../sessions/session.model';
import { getProgressSummary } from './progress.service';

useTestDatabase();

// Wednesday 4 November 2026. The week is Sunday 1 to Saturday 7 November in every zone tested here.
const NOW = new Date('2026-11-04T20:00:00Z');
const THIS_WEEK = [
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
];

function logSession(
  startedAt: string,
  participants: [userId: string, focusedMins: number][],
  roomId = new Types.ObjectId(),
) {
  return Session.create({
    roomId,
    roomName: 'Finals week focus',
    startedAt: new Date(startedAt),
    endedAt: new Date(startedAt),
    participants: participants.map(([userId, focusedMins]) => ({ userId, focusedMins })),
  });
}

const minsByDay = (summary: Awaited<ReturnType<typeof getProgressSummary>>) =>
  Object.fromEntries(summary.days.filter((day) => day.focusMins > 0).map((day) => [day.date, day.focusMins]));

describe('getProgressSummary', () => {
  it('gives a new user seven empty days and zeros', async () => {
    const { user } = await createUserWithToken({ weeklyGoalMins: 720 });
    expect(await getProgressSummary(user.id, 'week', NOW)).toEqual({
      range: 'week',
      today: '2026-11-04',
      days: THIS_WEEK.map((date) => ({ date, focusMins: 0 })),
      week: { focusMins: 0, goalMins: 720, sessions: 0, people: 0, rooms: 0 },
      lastWeek: { focusMins: 0 },
      streak: { current: 0, longest: 0, studiedToday: false },
    });
  });

  it('adds up only your own minutes, by day, against last week', async () => {
    const [{ user: maya }, { user: jordan }] = await Promise.all([
      createUserWithToken(),
      createUserWithToken(),
    ]);
    await logSession('2026-11-02T09:00:00Z', [
      [maya.id, 25],
      [jordan.id, 100],
    ]);
    await logSession('2026-11-02T15:00:00Z', [[maya.id, 50]]);
    await logSession('2026-11-04T09:00:00Z', [[maya.id, 40]]);
    await logSession('2026-10-28T09:00:00Z', [[maya.id, 90]]);
    // Jordan's alone, and from two weeks ago: neither counts.
    await logSession('2026-11-03T09:00:00Z', [[jordan.id, 60]]);
    await logSession('2026-10-21T09:00:00Z', [[maya.id, 300]]);

    const summary = await getProgressSummary(maya.id, 'week', NOW);
    expect(minsByDay(summary)).toEqual({ '2026-11-02': 75, '2026-11-04': 40 });
    expect(summary.week.focusMins).toBe(115);
    expect(summary.lastWeek.focusMins).toBe(90);
  });

  it('counts sessions, rooms and the other people in them this week', async () => {
    const [{ user: maya }, { user: jordan }, { user: sam }] = await Promise.all([
      createUserWithToken(),
      createUserWithToken(),
      createUserWithToken(),
    ]);
    const library = new Types.ObjectId();
    await logSession(
      '2026-11-02T09:00:00Z',
      [
        [maya.id, 25],
        [jordan.id, 25],
      ],
      library,
    );
    await logSession(
      '2026-11-03T09:00:00Z',
      [
        [maya.id, 25],
        [jordan.id, 25],
        [sam.id, 25],
      ],
      library,
    );
    await logSession('2026-11-04T09:00:00Z', [[maya.id, 25]]);
    // Last week's room and people don't count.
    await logSession('2026-10-30T09:00:00Z', [
      [maya.id, 25],
      [(await createUserWithToken()).user.id, 25],
    ]);

    const { week } = await getProgressSummary(maya.id, 'week', NOW);
    expect(week).toMatchObject({ sessions: 3, rooms: 2, people: 2 });
  });

  it('counts a session still in progress', async () => {
    const { user } = await createUserWithToken();
    await Session.create({
      roomId: new Types.ObjectId(),
      roomName: 'Finals week focus',
      startedAt: new Date('2026-11-04T18:00:00Z'),
      participants: [{ userId: user.id, focusedMins: 30 }],
    });
    expect((await getProgressSummary(user.id, 'week', NOW)).week).toMatchObject({
      focusMins: 30,
      sessions: 1,
    });
  });

  describe('time zones', () => {
    it('puts days and the week boundary in the user’s zone', async () => {
      const { user } = await createUserWithToken({ timeZone: 'America/Los_Angeles' });
      // 23:30 on Saturday 31 October in Los Angeles: last week. Then 01:30 on Sunday 1 November: this week.
      await logSession('2026-11-01T06:30:00Z', [[user.id, 20]]);
      await logSession('2026-11-01T08:30:00Z', [[user.id, 30]]);
      // 20:00 on Wednesday 4 November there, though it's already Thursday in UTC.
      await logSession('2026-11-05T04:00:00Z', [[user.id, 45]]);

      const summary = await getProgressSummary(user.id, 'week', new Date('2026-11-05T06:00:00Z'));
      expect(summary.today).toBe('2026-11-04');
      expect(minsByDay(summary)).toEqual({ '2026-11-01': 30, '2026-11-04': 45 });
      expect(summary.lastWeek.focusMins).toBe(20);
    });

    it('keeps the 25-hour day the clocks go back on as one day', async () => {
      // New York leaves daylight time at 2am on Sunday 1 November 2026 (06:00 UTC).
      const { user } = await createUserWithToken({ timeZone: 'America/New_York' });
      await logSession('2026-11-01T03:30:00Z', [[user.id, 10]]); // 23:30 Saturday (UTC−4)
      await logSession('2026-11-01T05:30:00Z', [[user.id, 20]]); // 01:30 Sunday (UTC−4)
      await logSession('2026-11-02T04:30:00Z', [[user.id, 40]]); // 23:30 Sunday (UTC−5)
      await logSession('2026-11-02T05:30:00Z', [[user.id, 80]]); // 00:30 Monday (UTC−5)

      const summary = await getProgressSummary(user.id, 'week', NOW);
      expect(minsByDay(summary)).toEqual({ '2026-11-01': 60, '2026-11-02': 80 });
      expect(summary.lastWeek.focusMins).toBe(10);
    });

    it('counts in UTC for a zone it doesn’t know', async () => {
      const { user } = await createUserWithToken({ timeZone: 'Mars/Olympus' });
      await logSession('2026-11-01T00:30:00Z', [[user.id, 25]]);
      expect(minsByDay(await getProgressSummary(user.id, 'week', NOW))).toEqual({ '2026-11-01': 25 });
    });
  });

  describe('streak', () => {
    it('is alive today and yesterday, and 0 once it has lapsed', async () => {
      const streak = { current: 6, longest: 11 };
      const at = async (lastStudiedAt: string) => {
        const { user } = await createUserWithToken({ streak, lastStudiedAt: new Date(lastStudiedAt) });
        return (await getProgressSummary(user.id, 'week', NOW)).streak;
      };
      expect(await at('2026-11-04T08:00:00Z')).toEqual({ current: 6, longest: 11, studiedToday: true });
      expect(await at('2026-11-03T08:00:00Z')).toEqual({ current: 6, longest: 11, studiedToday: false });
      expect(await at('2026-11-02T08:00:00Z')).toEqual({ current: 0, longest: 11, studiedToday: false });
    });

    it('counts today in the user’s zone', async () => {
      // 17:00 on 3 November in Los Angeles is yesterday there at 22:00 on the 4th, though it's the 4th in UTC.
      const { user } = await createUserWithToken({
        timeZone: 'America/Los_Angeles',
        streak: { current: 3, longest: 3 },
        lastStudiedAt: new Date('2026-11-04T01:00:00Z'),
      });
      const summary = await getProgressSummary(user.id, 'week', new Date('2026-11-05T06:00:00Z'));
      expect(summary.streak).toEqual({ current: 3, longest: 3, studiedToday: false });
    });
  });
});
