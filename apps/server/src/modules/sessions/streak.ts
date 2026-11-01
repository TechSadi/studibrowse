// Streak days, counted in the user's own time zone. Pure: every function takes the time it applies to.
import { DEFAULT_TIME_ZONE } from '@studibrowse/shared';

const MS_PER_DAY = 86_400_000;

export interface StreakState {
  current: number;
  longest: number;
  lastStudiedAt: Date | null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    } catch {
      // A zone this Node doesn't know (saved by a newer browser): count in the default rather than fail.
      format = formatter(DEFAULT_TIME_ZONE);
    }
    formatters.set(timeZone, format);
  }
  return format;
}

/** The calendar day `date` falls on in `timeZone`, as a day number (days since 1970-01-01). */
export function localDayNumber(date: Date, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day')) / MS_PER_DAY;
}

/**
 * Someone studied at `studiedAt`. The next study day after the last one adds a day; a missed day starts over
 * at 1; the same day (or an earlier one, from a session saved late) changes nothing. So applying the same
 * study twice is harmless, which lets a partial save and the final save both record it.
 */
export function nextStreak(state: StreakState, studiedAt: Date, timeZone: string): StreakState {
  const lastStudiedAt =
    state.lastStudiedAt && state.lastStudiedAt > studiedAt ? state.lastStudiedAt : studiedAt;
  if (!state.lastStudiedAt || state.current <= 0) {
    return { current: 1, longest: Math.max(state.longest, 1), lastStudiedAt };
  }
  const gap = localDayNumber(studiedAt, timeZone) - localDayNumber(state.lastStudiedAt, timeZone);
  if (gap <= 0) return { ...state, lastStudiedAt };
  const current = gap === 1 ? state.current + 1 : 1;
  return { current, longest: Math.max(state.longest, current), lastStudiedAt };
}
