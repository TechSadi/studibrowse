import { describe, expect, it } from 'vitest';
import type { RoomTimer } from '@studibrowse/shared';
import { clockOffset, timeLeftMs } from './roomClock';

const T0 = Date.parse('2026-01-05T09:00:00.000Z');

const running = (endsAt: number): RoomTimer => ({
  phase: 'focus',
  round: 1,
  endsAt: new Date(endsAt).toISOString(),
  pausedRemaining: null,
});

describe('clockOffset', () => {
  it('is how far the server is ahead of this device', () => {
    expect(clockOffset(T0 + 3000, T0)).toBe(3000);
    expect(clockOffset(T0 - 2000, T0)).toBe(-2000);
  });
});

describe('timeLeftMs', () => {
  it('measures a running phase on the server’s clock', () => {
    // This device is 3 s behind the server, so 3 s less is left than its own clock suggests.
    expect(timeLeftMs(running(T0 + 60_000), T0, 3000)).toBe(57_000);
    expect(timeLeftMs(running(T0 + 60_000), T0, -2000)).toBe(62_000);
  });

  it('never goes below zero', () => {
    expect(timeLeftMs(running(T0 - 5000), T0, 0)).toBe(0);
  });

  it('shows what was left when paused, whatever the clock says', () => {
    const paused: RoomTimer = { phase: 'shortBreak', round: 2, endsAt: null, pausedRemaining: 90_000 };
    expect(timeLeftMs(paused, T0, 0)).toBe(90_000);
    expect(timeLeftMs(paused, T0 + 999_999, 5000)).toBe(90_000);
  });

  it('is null when idle or done', () => {
    expect(timeLeftMs({ phase: 'idle', round: 1, endsAt: null, pausedRemaining: null }, T0, 0)).toBeNull();
    expect(timeLeftMs({ phase: 'done', round: 4, endsAt: null, pausedRemaining: null }, T0, 0)).toBeNull();
  });
});
