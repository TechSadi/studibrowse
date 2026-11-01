import { describe, expect, it } from 'vitest';
import type { RoomTimer, TimerSettings } from '@studibrowse/shared';
import { formatClock, isFocusStart, isRoundEnd, timerTitle, timerView } from './timerView';

const settings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};

const timer = (changes: Partial<RoomTimer>): RoomTimer => ({
  phase: 'focus',
  round: 1,
  endsAt: '2026-11-01T10:25:00.000Z',
  pausedRemaining: null,
  ...changes,
});

describe('formatClock', () => {
  it('shows minutes and seconds, rounding up', () => {
    expect(formatClock(872_400)).toBe('14:33');
    expect(formatClock(90 * 60_000)).toBe('90:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('timerView', () => {
  it('shows a running focus round', () => {
    const view = timerView(timer({ round: 2 }), settings, 12.5 * 60_000);
    expect(view).toMatchObject({
      label: 'Focus',
      tone: 'focus',
      clock: '12:30',
      detail: 'Round 2 of 4',
      remaining: 0.5,
      running: true,
    });
    expect(view.dots).toEqual(['done', 'now', 'todo', 'todo']);
  });

  it('marks a paused break and counts its round as done', () => {
    const view = timerView(
      timer({ phase: 'longBreak', round: 4, endsAt: null, pausedRemaining: 3 * 60_000 }),
      settings,
      3 * 60_000,
    );
    expect(view).toMatchObject({
      label: 'Long break',
      tone: 'break',
      detail: 'Round 4 of 4 · paused',
      paused: true,
    });
    expect(view.remaining).toBeCloseTo(0.2);
    expect(view.dots).toEqual(['done', 'done', 'done', 'done']);
  });

  it('shows the full focus length before the host starts', () => {
    const view = timerView(timer({ phase: 'idle', round: 0, endsAt: null }), settings, null);
    expect(view).toMatchObject({ label: 'Ready to start', clock: '25:00', remaining: 1, running: false });
    expect(view.dots).toEqual(['todo', 'todo', 'todo', 'todo']);
  });

  it('shows a finished run as a full ring', () => {
    const view = timerView(timer({ phase: 'done', round: 4, endsAt: null }), settings, null);
    expect(view).toMatchObject({
      label: 'Session complete',
      tone: 'done',
      clock: 'Done',
      detail: '4 rounds finished',
      remaining: 1,
    });
  });
});

describe('timerTitle', () => {
  it('puts the time left first while running', () => {
    const view = timerView(timer({}), settings, 14 * 60_000 + 32_000);
    expect(timerTitle(view, 'Finals week')).toBe('14:32 · Focus · Finals week');
  });

  it('says paused, and falls back to the room name otherwise', () => {
    const paused = timerView(timer({ endsAt: null, pausedRemaining: 60_000 }), settings, 60_000);
    expect(timerTitle(paused, 'Finals week')).toBe('Paused 01:00 · Finals week');
    const idle = timerView(timer({ phase: 'idle', endsAt: null }), settings, null);
    expect(timerTitle(idle, 'Finals week')).toBe('Finals week · StudiBrowse');
  });
});

describe('isRoundEnd', () => {
  it('is true when a focus round or a break ends', () => {
    expect(isRoundEnd('focus', 'shortBreak')).toBe(true);
    expect(isRoundEnd('focus', 'longBreak')).toBe(true);
    expect(isRoundEnd('focus', 'done')).toBe(true);
    expect(isRoundEnd('shortBreak', 'focus')).toBe(true);
    expect(isRoundEnd('longBreak', 'focus')).toBe(true);
  });

  it('is false when the host starts or resets the timer', () => {
    expect(isRoundEnd('idle', 'focus')).toBe(false);
    expect(isRoundEnd('focus', 'idle')).toBe(false);
    expect(isRoundEnd('done', 'focus')).toBe(false);
    expect(isRoundEnd('focus', 'focus')).toBe(false);
  });
});

describe('isFocusStart', () => {
  it('is true when the host starts a run', () => {
    expect(isFocusStart('idle', 'focus')).toBe(true);
    expect(isFocusStart('done', 'focus')).toBe(true);
  });

  it('is false when focus follows a break, or for anything else', () => {
    expect(isFocusStart('shortBreak', 'focus')).toBe(false);
    expect(isFocusStart('longBreak', 'focus')).toBe(false);
    expect(isFocusStart('focus', 'focus')).toBe(false);
    expect(isFocusStart('idle', 'idle')).toBe(false);
  });
});
