import type { PublicUser } from '@studibrowse/shared';

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
 * The sidebar streak card's numbers. The server only updates the streak when a session is logged,
 * so a stored streak whose last study day is before yesterday has already lapsed.
 */
export function streakView(user: Pick<PublicUser, 'streak' | 'lastStudiedAt'>, now: Date): StreakView {
  const week = Array<boolean>(7).fill(false);
  if (!user.lastStudiedAt || user.streak.current <= 0) return { days: 0, studiedToday: false, week };

  const daysAgo = calendarDaysBetween(new Date(user.lastStudiedAt), now);
  if (daysAgo < 0 || daysAgo > 1) return { days: 0, studiedToday: false, week };

  // Fill backwards from the last study day.
  const lastIndex = 6 - daysAgo;
  for (let i = 0; i < Math.min(user.streak.current, lastIndex + 1); i++) week[lastIndex - i] = true;
  return { days: user.streak.current, studiedToday: daysAgo === 0, week };
}
