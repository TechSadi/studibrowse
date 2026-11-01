// Weeks for the weekly goal: Sunday to Saturday in the user's own time zone, like Home's chart. Pure.
import { localDayNumber } from './streak';

/** Day number (see localDayNumber) of the Sunday that starts the week `now` falls in. */
export function weekStartDay(now: Date, timeZone: string): number {
  const today = localDayNumber(now, timeZone);
  // Day 0, 1 January 1970, was a Thursday: (day + 4) % 7 is 0 on Sundays.
  return today - ((today + 4) % 7);
}

/** `date` falls in the same Sunday-to-Saturday week as `now`. */
export function isThisWeek(date: Date, now: Date, timeZone: string): boolean {
  const day = localDayNumber(date, timeZone);
  const start = weekStartDay(now, timeZone);
  return day >= start && day < start + 7;
}

/** `lastStudiedAt` is on the same calendar day as `now`. */
export function studiedToday(lastStudiedAt: Date | null, now: Date, timeZone: string): boolean {
  return lastStudiedAt !== null && localDayNumber(lastStudiedAt, timeZone) === localDayNumber(now, timeZone);
}
