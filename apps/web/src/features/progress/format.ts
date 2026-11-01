import type { ProgressDay } from '@studibrowse/shared';
import { formatMins } from '../rooms/timerText';

const MS_PER_DAY = 86_400_000;

/**
 * A "2026-11-01" day from the server, already in the user's time zone. Formatted in UTC so the browser's
 * own zone can't move it to the day before.
 */
function fromDayKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** "2026-11-01" → "Sun" (or "Sunday" with `long`). */
export function weekdayOf(key: string, long = false): string {
  return fromDayKey(key).toLocaleDateString('en-GB', { weekday: long ? 'long' : 'short', timeZone: 'UTC' });
}

/** "Sun 1 Nov". */
export function shortDayOf(key: string): string {
  return fromDayKey(key).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "Sun 1 Nov to Sat 7 Nov". */
export function rangeLabel(days: ProgressDay[]): string {
  const first = days[0];
  const last = days.at(-1);
  return first && last ? `${shortDayOf(first.date)} to ${shortDayOf(last.date)}` : '';
}

/** "Today", "Yesterday" or "Thu 29 Oct" for a session, in the browser's time zone. */
export function sessionDayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const dayNumber = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY;
  const daysAgo = dayNumber(now) - dayNumber(date);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Thu 29 Oct" for a session, in the browser's time zone. */
export function sessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "3 of 4", or "3" for an older session that didn't record its planned rounds. */
export function roundsText(done: number, total: number | null): string {
  return total ? `${done} of ${total}` : String(done);
}

/** "2 of 4", or "None set" for a room without goals. */
export function goalsText(done: number, total: number): string {
  return total > 0 ? `${done} of ${total}` : 'None set';
}

/** "with 12 people", or "just you". */
export function peopleText(count: number): string {
  return count > 1 ? `with ${count} people` : 'just you';
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function daysText(count: number): string {
  return plural(count, 'day', 'days');
}

/** Whole percent of the goal reached, uncapped (a goal can be beaten). 0 without a goal. */
export function goalPercent(focusMins: number, goalMins: number): number {
  return goalMins > 0 ? Math.round((focusMins / goalMins) * 100) : 0;
}

/** Change on last week, in whole percent, or null when last week had nothing to compare with. */
export function weekDelta(focusMins: number, lastWeekMins: number): number | null {
  return lastWeekMins > 0 ? Math.round(((focusMins - lastWeekMins) / lastWeekMins) * 100) : null;
}

/** "+18%" or "−12%" (a real minus sign). */
export function formatDelta(percent: number): string {
  return percent < 0 ? `−${Math.abs(percent)}%` : `+${percent}%`;
}

/** The This week tile's note. Weeks end on Saturday. */
export function toGoalText(focusMins: number, goalMins: number): string {
  if (focusMins === 0) return 'Finish a focus round to start your week.';
  const left = goalMins - focusMins;
  return left > 0 ? `${formatMins(left)} to reach your goal by Saturday` : 'Goal reached. Nice work.';
}

/** The Sessions tile's note. */
export function sessionsNote({
  sessions,
  people,
  rooms,
}: {
  sessions: number;
  people: number;
  rooms: number;
}) {
  if (sessions === 0) return 'Join a room to log your first one.';
  const where = plural(rooms, 'room', 'rooms');
  return people === 0
    ? `Just you so far, in ${where}`
    : `With ${plural(people, 'different person', 'different people')} across ${where}`;
}

/** The Streak tile's note. */
export function longestStreakText(longest: number): string {
  return longest > 0 ? `Your longest streak is ${daysText(longest)}` : 'Finish a focus round to start one.';
}

/** Minutes a day that add up to the weekly goal: the dashed pace line on both charts. */
export function dailyPace(goalMins: number): number {
  return goalMins / 7;
}

/** The top of a day chart's scale: the biggest day or the daily pace, with room above for its label. */
export function chartMax(days: ProgressDay[], goalMins: number): number {
  const biggest = Math.max(dailyPace(goalMins), ...days.map((day) => day.focusMins));
  return biggest > 0 ? biggest * 1.15 : 60;
}
