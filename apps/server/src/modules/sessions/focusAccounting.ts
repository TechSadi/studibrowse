// Turns a run's focus credits (milliseconds) into a session's participants (whole minutes). Pure.
import type { RunFocus } from '../rooms/roomTimer.service';

const MINUTE_MS = 60_000;

export interface Participant {
  userId: string;
  focusedMins: number;
}

/**
 * Whole minutes, rounded down, from each person's running total, so partial saves never add up rounding.
 * People with less than a minute are left out: they didn't study in this run.
 */
export function toParticipants(focus: RunFocus[]): Participant[] {
  return focus.flatMap(({ userId, focusedMs }) => {
    const focusedMins = Math.floor(focusedMs / MINUTE_MS);
    return focusedMins > 0 ? [{ userId, focusedMins }] : [];
  });
}

/** A run is logged only if someone focused for at least a minute. */
export function hasLoggableFocus(focus: RunFocus[]): boolean {
  return toParticipants(focus).length > 0;
}

export function totalFocusMins(participants: Participant[]): number {
  return participants.reduce((sum, { focusedMins }) => sum + focusedMins, 0);
}
