import { describe, expect, it } from 'vitest';
import type { RoomTimer, TimerSettings } from '@studibrowse/shared';
import { formatMins, phaseView, timerPlan } from './timerText';

const settings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};

describe('formatMins', () => {
  it('formats minutes like the mockup', () => {
    expect(formatMins(25)).toBe('25m');
    expect(formatMins(100)).toBe('1h 40m');
    expect(formatMins(125)).toBe('2h 05m');
    expect(formatMins(60)).toBe('1h 00m');
  });
});

describe('timerPlan', () => {
  const now = new Date(2026, 10, 1, 18, 0);

  it('adds short breaks between rounds, but not after the last', () => {
    expect(timerPlan(settings, now)).toEqual({
      rounds: 4,
      focusMins: 100,
      totalMins: 115,
      endsAround: '19:55',
    });
  });

  it('uses a long break every N rounds', () => {
    const plan = timerPlan({ ...settings, roundsBeforeLong: 2, totalRounds: 5 }, now);
    // Breaks after rounds 1-4: short, long, short, long.
    expect(plan.totalMins).toBe(125 + 5 + 15 + 5 + 15);
  });

  it('has no breaks for a single round', () => {
    expect(timerPlan({ ...settings, totalRounds: 1 }, now)).toMatchObject({
      totalMins: 25,
      endsAround: '18:25',
    });
  });
});

describe('phaseView', () => {
  const now = Date.parse('2026-11-01T18:00:00Z');
  const at = (mins: number) => new Date(now + mins * 60_000).toISOString();
  const timer = (overrides: Partial<RoomTimer>): RoomTimer => ({
    phase: 'focus',
    round: 1,
    endsAt: null,
    pausedRemaining: 25 * 60_000,
    ...overrides,
  });

  it('shows a new room as waiting to start', () => {
    expect(phaseView(timer({}), settings, now)).toEqual({
      title: 'Waiting to start',
      detail: '4 × 25 min focus rounds',
      remaining: 1,
      tone: 'idle',
    });
  });

  it('counts down a running focus round from endsAt', () => {
    const view = phaseView(timer({ round: 2, endsAt: at(10), pausedRemaining: null }), settings, now);
    expect(view).toMatchObject({ title: 'Focus round · 2 of 4', detail: '10 min left', tone: 'focus' });
    expect(view.remaining).toBeCloseTo(10 / 25);
  });

  it('invites people in during a break', () => {
    const view = phaseView(
      timer({ phase: 'shortBreak', endsAt: at(4), pausedRemaining: null }),
      settings,
      now,
    );
    expect(view).toMatchObject({
      title: 'On a break · 1 of 4',
      detail: '4 min left, good time to join',
      tone: 'break',
    });
  });

  it('shows a paused timer with its time left', () => {
    expect(phaseView(timer({ round: 3, pausedRemaining: 12 * 60_000 }), settings, now)).toMatchObject({
      title: 'Paused · round 3 of 4',
      detail: '12 min left',
      tone: 'idle',
    });
  });

  it('never shows negative time once endsAt has passed', () => {
    expect(phaseView(timer({ endsAt: at(-2), pausedRemaining: null }), settings, now)).toMatchObject({
      detail: '0 min left',
      remaining: 0,
    });
  });
});
