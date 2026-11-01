import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomTimer, TimerStatePayload } from '@studibrowse/shared';
import { useRoomTimer, type TimerSnapshot } from './useRoomTimer';

// The latest timer:state listener the hook registered, so tests can play the server.
let onTimerState: ((payload: TimerStatePayload) => void) | null = null;
vi.mock('../../hooks/useSocket', () => ({
  useSocketEvent: (event: string, handler: (payload: TimerStatePayload) => void) => {
    if (event === 'timer:state') onTimerState = handler;
  },
}));

const T0 = Date.parse('2026-01-05T09:00:00.000Z');
const ROOM = 'room-1';
const MIN = 60_000;

const running = (endsAt: number): RoomTimer => ({
  phase: 'focus',
  round: 1,
  endsAt: new Date(endsAt).toISOString(),
  pausedRemaining: null,
});
const paused = (left: number): RoomTimer => ({
  phase: 'focus',
  round: 1,
  endsAt: null,
  pausedRemaining: left,
});

function renderTimer(initial: TimerSnapshot) {
  return renderHook(({ snapshot }) => useRoomTimer(ROOM, snapshot), { initialProps: { snapshot: initial } });
}

/** Moves the clock on, running the animation frames due in that time. */
function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(T0);
  onTimerState = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useRoomTimer', () => {
  it('works out the time left from endsAt on the server’s clock', () => {
    // The server is 2 s ahead of this device.
    const { result } = renderTimer({ timer: running(T0 + 2000 + 25 * MIN), serverNow: T0 + 2000 });
    expect(result.current.remainingMs).toBe(25 * MIN);

    elapse(10_000);
    expect(result.current.remainingMs).toBeLessThanOrEqual(25 * MIN - 9000);
    expect(result.current.remainingMs).toBeGreaterThan(25 * MIN - 11_000);
  });

  it('stops at zero rather than going negative', () => {
    const { result } = renderTimer({ timer: running(T0 + 3000), serverNow: T0 });
    elapse(10_000);
    expect(result.current.remainingMs).toBe(0);
  });

  it('holds still while paused', () => {
    const { result } = renderTimer({ timer: paused(90_000), serverNow: T0 });
    elapse(30_000);
    expect(result.current.remainingMs).toBe(90_000);
  });

  it('is null when idle', () => {
    const idle: RoomTimer = { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null };
    expect(renderTimer({ timer: idle, serverNow: T0 }).result.current.remainingMs).toBeNull();
  });

  it('follows timer:state for its room and ignores other rooms', () => {
    const { result } = renderTimer({ timer: running(T0 + 25 * MIN), serverNow: T0 });

    act(() => onTimerState?.({ roomId: 'other-room', timer: paused(MIN), serverNow: T0 }));
    expect(result.current.timer.endsAt).not.toBeNull();

    act(() => onTimerState?.({ roomId: ROOM, timer: paused(12 * MIN), serverNow: T0 }));
    expect(result.current.timer).toEqual(paused(12 * MIN));
    expect(result.current.remainingMs).toBe(12 * MIN);

    // Resumed, with the server now 5 s behind this device.
    act(() => onTimerState?.({ roomId: ROOM, timer: running(T0 + 12 * MIN - 5000), serverNow: T0 - 5000 }));
    expect(result.current.remainingMs).toBe(12 * MIN);
  });

  it('starts over from a new initial snapshot', () => {
    const { result, rerender } = renderTimer({ timer: running(T0 + 25 * MIN), serverNow: T0 });
    rerender({ snapshot: { timer: paused(MIN), serverNow: T0 } });
    expect(result.current.remainingMs).toBe(MIN);
  });

  it('only re-renders when the shown second changes', () => {
    const initial = { timer: running(T0 + 25 * MIN), serverNow: T0 };
    let renders = 0;
    renderHook(() => {
      renders++;
      return useRoomTimer(ROOM, initial);
    });
    const afterMount = renders;
    elapse(3000);
    // About one render per second, not one per animation frame (~180 in 3 s).
    expect(renders - afterMount).toBeLessThanOrEqual(4);
  });
});
