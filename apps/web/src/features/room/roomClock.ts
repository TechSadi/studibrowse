import type { RoomTimer } from '@studibrowse/shared';

/**
 * How far the server's clock is ahead of this device's (negative if behind), from a `serverNow` received at
 * `receivedAt` (both epoch ms). Network delay is small next to a minutes-long phase, so it isn't corrected for.
 */
export function clockOffset(serverNow: number, receivedAt: number): number {
  return serverNow - receivedAt;
}

/**
 * Milliseconds left in the current phase on the server's clock: `endsAt - (now + offset)` while running,
 * `pausedRemaining` while paused, and null when idle or done.
 */
export function timeLeftMs(timer: RoomTimer, now: number, offset: number): number | null {
  if (timer.endsAt) return Math.max(0, Date.parse(timer.endsAt) - (now + offset));
  return timer.pausedRemaining;
}
