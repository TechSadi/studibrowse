import type { MySession, ProgressSummaryResponse } from '@studibrowse/shared';

const WEEK = ['01', '02', '03', '04', '05', '06', '07'].map((day) => `2026-11-${day}`);

/** A progress summary for the week of Sunday 1 November 2026, with today on Wednesday the 4th. */
export function makeSummary(
  overrides: Partial<ProgressSummaryResponse> & { minsByDay?: number[] } = {},
): ProgressSummaryResponse {
  const { minsByDay = [0, 0, 0, 0, 0, 0, 0], ...rest } = overrides;
  const days = WEEK.map((date, index) => ({ date, focusMins: minsByDay[index] ?? 0 }));
  const focusMins = days.reduce((sum, day) => sum + day.focusMins, 0);
  return {
    range: 'week',
    today: '2026-11-04',
    days,
    week: { focusMins, goalMins: 720, sessions: 0, people: 0, rooms: 0 },
    lastWeek: { focusMins: 0 },
    streak: { current: 0, longest: 0, studiedToday: false },
    ...rest,
  };
}

let sessionCount = 0;

export function makeSession(overrides: Partial<MySession> = {}): MySession {
  sessionCount += 1;
  return {
    id: `s${sessionCount}`,
    roomName: 'Finals week focus',
    startedAt: '2026-10-29T10:00:00.000Z',
    endedAt: '2026-10-29T11:50:00.000Z',
    focusedMins: 100,
    roundsCompleted: 4,
    roundsTotal: 4,
    goalsDone: 2,
    goalsTotal: 4,
    peopleCount: 12,
    ...overrides,
  };
}
