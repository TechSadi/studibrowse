import type { ProgressSummaryResponse, PublicUser } from '@studibrowse/shared';

/** What the streak card needs: the summary's streak, worked out in the user's own time zone. */
export type StreakState = Pick<ProgressSummaryResponse['streak'], 'current' | 'studiedToday'>;

export interface StreakView {
  /** Days in a row, or 0 when the streak has lapsed. */
  days: number;
  studiedToday: boolean;
  /** The last 7 days, oldest first; the last entry is today. true = studied that day. */
  week: boolean[];
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `earlier` to `later` in the viewer's time zone. */
function calendarDaysBetween(earlier: Date, later: Date): number {
  const start = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const end = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((end - start) / MS_PER_DAY);
}

/**
 * The streak from the signed-in user as last loaded, in the browser's time zone: the fallback while the
 * progress summary can't load. The server only updates the streak when a session is logged, so a stored
 * streak whose last study day is before yesterday has already lapsed.
 */
export function streakFromUser(user: Pick<PublicUser, 'streak' | 'lastStudiedAt'>, now: Date): StreakState {
  if (!user.lastStudiedAt || user.streak.current <= 0) return { current: 0, studiedToday: false };
  const daysAgo = calendarDaysBetween(new Date(user.lastStudiedAt), now);
  if (daysAgo < 0 || daysAgo > 1) return { current: 0, studiedToday: false };
  return { current: user.streak.current, studiedToday: daysAgo === 0 };
}

/**
 * The sidebar streak card's numbers. A streak of N days means the N days up to the last study day (today
 * or yesterday) were all studied, so the week's dots fill back from there.
 */
export function streakView({ current, studiedToday }: StreakState): StreakView {
  const week = Array<boolean>(7).fill(false);
  if (current <= 0) return { days: 0, studiedToday: false, week };
  const lastIndex = studiedToday ? 6 : 5;
  for (let i = 0; i < Math.min(current, lastIndex + 1); i++) week[lastIndex - i] = true;
  return { days: current, studiedToday, week };
}
