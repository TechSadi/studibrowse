import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoomTimer, TimerSettings } from '@studibrowse/shared';
import { TimerRing } from './TimerRing';
import { timerView } from './timerView';

const settings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: false,
};

const focus: RoomTimer = {
  phase: 'focus',
  round: 2,
  endsAt: '2026-01-05T09:25:00.000Z',
  pausedRemaining: null,
};
const shortBreak: RoomTimer = { ...focus, phase: 'shortBreak' };

function announcer(): HTMLElement {
  const region = document.querySelector('[aria-live="polite"]');
  if (!(region instanceof HTMLElement)) throw new Error('No live region');
  return region;
}

afterEach(cleanup);

describe('TimerRing', () => {
  it('announces the phase and round, not the countdown', () => {
    const { rerender } = render(
      <TimerRing view={timerView(focus, settings, 600_000)} remainingMs={600_000} />,
    );
    expect(announcer().textContent).toBe('Focus. Round 2 of 4');

    // A second later the clock moves but the announcement doesn't.
    rerender(<TimerRing view={timerView(focus, settings, 599_000)} remainingMs={599_000} />);
    expect(announcer().textContent).toBe('Focus. Round 2 of 4');
    expect(screen.getByText('09:59')).toBeDefined();
  });

  it('announces a new phase', () => {
    const { rerender } = render(<TimerRing view={timerView(focus, settings, 1000)} remainingMs={1000} />);
    rerender(<TimerRing view={timerView(shortBreak, settings, 300_000)} remainingMs={300_000} />);
    expect(announcer().textContent).toBe('Short break. Round 2 of 4');
  });

  it('keeps the countdown out of the live region and in the timer’s label, by the minute', () => {
    render(<TimerRing view={timerView(focus, settings, 61_000)} remainingMs={61_000} />);
    expect(announcer().textContent).not.toContain('01:01');
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Focus. Round 2 of 4, 2 min left');
  });
});
