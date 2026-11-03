import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RoomTimer, TimerSettings } from '@studibrowse/shared';
import { usePhaseSettings } from './usePhaseSettings';

const settings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: false,
};
const longer: TimerSettings = { ...settings, focusMins: 50 };

const running = (phase: RoomTimer['phase'], round: number): RoomTimer => ({
  phase,
  round,
  endsAt: '2026-11-01T10:25:00.000Z',
  pausedRemaining: null,
});

function render(timer: RoomTimer, current: TimerSettings) {
  return renderHook(({ t, s }) => usePhaseSettings(t, s), { initialProps: { t: timer, s: current } });
}

describe('usePhaseSettings', () => {
  it('keeps the settings a running phase started with, and takes the new ones at the next phase', () => {
    const { result, rerender } = render(running('focus', 1), settings);
    rerender({ t: running('focus', 1), s: longer });
    expect(result.current).toBe(settings);
    rerender({ t: running('shortBreak', 1), s: longer });
    expect(result.current).toBe(longer);
  });

  it('follows new settings at once while idle', () => {
    const idle: RoomTimer = { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null };
    const { result, rerender } = render(idle, settings);
    rerender({ t: idle, s: longer });
    expect(result.current).toBe(longer);
  });

  it('follows them for a phase waiting at its new full length', () => {
    const waiting = (ms: number): RoomTimer => ({
      phase: 'focus',
      round: 2,
      endsAt: null,
      pausedRemaining: ms,
    });
    const { result, rerender } = render(waiting(25 * 60_000), settings);
    rerender({ t: waiting(50 * 60_000), s: longer });
    expect(result.current).toBe(longer);
  });
});
