import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimerSettings } from '@studibrowse/shared';
import {
  advance,
  idleTimer,
  isPaused,
  isRunning,
  pause,
  phaseDurationMs,
  reset,
  resume,
  skip,
  start,
  type TimerState,
} from './timer';

const MIN = 60_000;
const T0 = new Date('2026-01-05T09:00:00.000Z');

const settings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};
const manual: TimerSettings = { ...settings, autoStart: false };

// The fake clock: every call reads `now()`, and `tick` moves it on.
const now = () => new Date();
const tick = (ms: number) => vi.advanceTimersByTime(ms);
const at = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

const runningState = (phase: TimerState['phase'], round: number, endsAt: Date): TimerState => ({
  phase,
  round,
  endsAt,
  pausedRemaining: null,
});
const pausedState = (phase: TimerState['phase'], round: number, left: number): TimerState => ({
  phase,
  round,
  endsAt: null,
  pausedRemaining: left,
});
const done = (rounds: number): TimerState => ({
  phase: 'done',
  round: rounds,
  endsAt: null,
  pausedRemaining: null,
});

/** Lets the current phase run out, then advances. */
function finishPhase(state: TimerState, rules: TimerSettings = settings): TimerState {
  if (state.endsAt) vi.setSystemTime(state.endsAt);
  return advance(state, rules, now());
}

function expectInvalid(run: () => unknown) {
  expect(run).toThrow(expect.objectContaining({ status: 409, code: 'INVALID_TIMER_COMMAND' }));
}

describe('idleTimer', () => {
  it('is idle at round 1 with no time set', () => {
    expect(idleTimer()).toEqual({ phase: 'idle', round: 1, endsAt: null, pausedRemaining: null });
    expect(isRunning(idleTimer())).toBe(false);
    expect(isPaused(idleTimer())).toBe(false);
  });
});

describe('phaseDurationMs', () => {
  it('reads each phase length from the settings', () => {
    expect(phaseDurationMs('focus', settings)).toBe(25 * MIN);
    expect(phaseDurationMs('shortBreak', settings)).toBe(5 * MIN);
    expect(phaseDurationMs('longBreak', settings)).toBe(15 * MIN);
  });
});

describe('start', () => {
  it('starts focus round 1 from idle, ending a full focus length from now', () => {
    const state = start(idleTimer(), settings, now());
    expect(state).toEqual(runningState('focus', 1, at(25 * MIN)));
    expect(isRunning(state)).toBe(true);
  });

  it('starts a fresh run from done ("Start again")', () => {
    tick(3 * MIN);
    expect(start(done(4), settings, now())).toEqual(runningState('focus', 1, at(28 * MIN)));
  });

  it('starts running even with autoStart off: pressing Start is the host saying go', () => {
    expect(start(idleTimer(), manual, now())).toEqual(runningState('focus', 1, at(25 * MIN)));
  });

  it('is rejected while a phase is running or paused', () => {
    expectInvalid(() => start(runningState('focus', 2, at(MIN)), settings, now()));
    expectInvalid(() => start(pausedState('shortBreak', 2, MIN), settings, now()));
  });
});

describe('pause and resume', () => {
  it('keeps exactly the time that was left, however long the pause lasts', () => {
    let state = start(idleTimer(), settings, now());
    tick(15 * MIN);
    state = pause(state, settings, now());
    expect(state).toEqual(pausedState('focus', 1, 10 * MIN));
    expect(isPaused(state)).toBe(true);

    tick(60 * MIN);
    state = resume(state, settings, now());
    expect(state).toEqual(runningState('focus', 1, new Date(now().getTime() + 10 * MIN)));
  });

  it('adds up over several pauses', () => {
    let state = start(idleTimer(), settings, now()); // 25 min
    tick(5 * MIN);
    state = pause(state, settings, now()); // 20 left
    tick(7 * MIN);
    state = resume(state, settings, now());
    tick(8 * MIN + 30_000);
    state = pause(state, settings, now()); // 11:30 left
    expect(state.pausedRemaining).toBe(11 * MIN + 30_000);
    tick(MIN);
    state = resume(state, settings, now());
    // 5 + 8.5 minutes ran, 8 minutes paused: the round ends 25 + 8 minutes after it started.
    expect(state.endsAt).toEqual(at(33 * MIN));
  });

  it('pauses during a break and keeps the phase and round', () => {
    const state = pause(runningState('longBreak', 4, at(9 * MIN)), settings, now());
    expect(state).toEqual(pausedState('longBreak', 4, 9 * MIN));
  });

  it('never stores negative time when paused after endsAt passed', () => {
    const state = runningState('focus', 1, at(MIN));
    tick(2 * MIN);
    expect(pause(state, settings, now()).pausedRemaining).toBe(0);
  });

  it('rejects pause unless the timer is running', () => {
    expectInvalid(() => pause(idleTimer(), settings, now()));
    expectInvalid(() => pause(done(4), settings, now()));
    expectInvalid(() => pause(pausedState('focus', 1, MIN), settings, now()));
  });

  it('rejects resume unless the timer is paused', () => {
    expectInvalid(() => resume(idleTimer(), settings, now()));
    expectInvalid(() => resume(done(4), settings, now()));
    expectInvalid(() => resume(runningState('focus', 1, at(MIN)), settings, now()));
  });
});

describe('advance', () => {
  it('goes from focus to a short break, keeping the round', () => {
    const state = finishPhase(start(idleTimer(), settings, now()));
    expect(state).toEqual(runningState('shortBreak', 1, at(30 * MIN)));
  });

  it('goes from a break to the next focus round', () => {
    const state = finishPhase(runningState('shortBreak', 1, at(30 * MIN)));
    expect(state).toEqual(runningState('focus', 2, at(55 * MIN)));
  });

  it('goes from a long break to the next focus round', () => {
    const rules = { ...settings, totalRounds: 8 };
    const state = finishPhase(runningState('longBreak', 4, at(MIN)), rules);
    expect(state).toEqual(runningState('focus', 5, at(26 * MIN)));
  });

  it('places a long break after every roundsBeforeLong rounds, short breaks otherwise', () => {
    const rules = { ...settings, roundsBeforeLong: 2, totalRounds: 5 };
    const breaks: string[] = [];
    let state = start(idleTimer(), rules, now());
    while (state.phase !== 'done') {
      state = finishPhase(state, rules);
      if (state.phase !== 'focus' && state.phase !== 'done')
        breaks.push(`${state.phase} after ${state.round}`);
    }
    expect(breaks).toEqual([
      'shortBreak after 1',
      'longBreak after 2',
      'shortBreak after 3',
      'longBreak after 4',
    ]);
  });

  it('finishes after the last focus round with no break, even when a long break would be due', () => {
    // totalRounds 4 with a long break every 4: round 4 would be a long-break round.
    expect(finishPhase(runningState('focus', 4, at(MIN)))).toEqual(done(4));
  });

  it('finishes straight after a single-round run', () => {
    const rules = { ...settings, totalRounds: 1 };
    expect(finishPhase(start(idleTimer(), rules, now()), rules)).toEqual(done(1));
  });

  it('walks a whole 4-round run in order', () => {
    const seen: string[] = [];
    let state = start(idleTimer(), settings, now());
    while (state.phase !== 'done') {
      seen.push(`${state.phase} ${state.round}`);
      state = finishPhase(state);
    }
    expect(seen).toEqual([
      'focus 1',
      'shortBreak 1',
      'focus 2',
      'shortBreak 2',
      'focus 3',
      'shortBreak 3',
      'focus 4',
    ]);
    // 4 × 25 focus + 3 × 5 break.
    expect(now()).toEqual(at(115 * MIN));
  });

  it('with autoStart off, waits for the host, paused at the full next phase', () => {
    let state = finishPhase(start(idleTimer(), manual, now()), manual);
    expect(state).toEqual(pausedState('shortBreak', 1, 5 * MIN));

    tick(10 * MIN);
    expect(advance(state, manual, now())).toBe(state);

    state = resume(state, manual, now());
    state = finishPhase(state, manual);
    expect(state).toEqual(pausedState('focus', 2, 25 * MIN));
  });

  it('with autoStart off, still finishes after the last round', () => {
    expect(finishPhase(runningState('focus', 4, at(MIN)), manual)).toEqual(done(4));
  });

  it('times the next phase from the old endsAt, so a late timeout does not drift', () => {
    const state = runningState('focus', 1, at(25 * MIN));
    vi.setSystemTime(at(25 * MIN + 1_500));
    expect(advance(state, settings, now())).toEqual(runningState('shortBreak', 1, at(30 * MIN)));
  });

  it('catches up through every phase that ended while the server was down', () => {
    const state = start(idleTimer(), settings, now());
    // focus 1 ends at 25, break at 30, focus 2 at 55, break at 60; at 70 we're 10 min into focus 3.
    vi.setSystemTime(at(70 * MIN));
    expect(advance(state, settings, now())).toEqual(runningState('focus', 3, at(85 * MIN)));
  });

  it('catches up all the way to done', () => {
    const state = start(idleTimer(), settings, now());
    vi.setSystemTime(at(10 * 60 * MIN));
    expect(advance(state, settings, now())).toEqual(done(4));
  });

  it('catches up only to the first waiting phase when autoStart is off', () => {
    const state = start(idleTimer(), manual, now());
    vi.setSystemTime(at(10 * 60 * MIN));
    expect(advance(state, manual, now())).toEqual(pausedState('shortBreak', 1, 5 * MIN));
  });

  it('changes nothing when the phase has not ended yet', () => {
    const state = start(idleTimer(), settings, now());
    tick(25 * MIN - 1);
    expect(advance(state, settings, now())).toBe(state);
  });

  it('changes nothing when idle, paused or done', () => {
    for (const state of [idleTimer(), pausedState('focus', 2, 0), done(4)]) {
      expect(advance(state, settings, now())).toBe(state);
    }
  });
});

describe('skip', () => {
  it('skips a running focus round into its break, running', () => {
    const state = start(idleTimer(), settings, now());
    tick(10 * MIN);
    expect(skip(state, settings, now())).toEqual(runningState('shortBreak', 1, at(15 * MIN)));
  });

  it('skips into a long break when one is due', () => {
    expect(skip(runningState('focus', 4, at(MIN)), { ...settings, totalRounds: 8 }, now())).toEqual(
      runningState('longBreak', 4, at(15 * MIN)),
    );
  });

  it('skips a short break into the next focus round', () => {
    expect(skip(runningState('shortBreak', 2, at(3 * MIN)), settings, now())).toEqual(
      runningState('focus', 3, at(25 * MIN)),
    );
  });

  it('skips a long break into the next focus round', () => {
    const rules = { ...settings, totalRounds: 8 };
    expect(skip(runningState('longBreak', 4, at(12 * MIN)), rules, now())).toEqual(
      runningState('focus', 5, at(25 * MIN)),
    );
  });

  it('with autoStart off, lands paused at the full next phase', () => {
    expect(skip(runningState('focus', 1, at(MIN)), manual, now())).toEqual(
      pausedState('shortBreak', 1, 5 * MIN),
    );
  });

  it('keeps a paused timer paused, even with autoStart on', () => {
    expect(skip(pausedState('focus', 2, 7 * MIN), settings, now())).toEqual(
      pausedState('shortBreak', 2, 5 * MIN),
    );
    expect(skip(pausedState('shortBreak', 2, MIN), settings, now())).toEqual(
      pausedState('focus', 3, 25 * MIN),
    );
  });

  it('skipping the last focus round finishes the run', () => {
    expect(skip(runningState('focus', 4, at(20 * MIN)), settings, now())).toEqual(done(4));
    expect(skip(pausedState('focus', 4, MIN), settings, now())).toEqual(done(4));
  });

  it('is rejected when idle or done', () => {
    expectInvalid(() => skip(idleTimer(), settings, now()));
    expectInvalid(() => skip(done(4), settings, now()));
  });
});

describe('reset', () => {
  it('goes back to idle from every phase', () => {
    const states = [
      idleTimer(),
      runningState('focus', 3, at(MIN)),
      pausedState('shortBreak', 2, MIN),
      runningState('longBreak', 4, at(MIN)),
      done(4),
    ];
    for (const state of states) expect(reset(state, settings, now())).toEqual(idleTimer());
  });
});

describe('purity', () => {
  it('never changes the state it is given', () => {
    const running = start(idleTimer(), settings, now());
    const paused = pause(running, settings, now());
    const snapshots = [running, paused].map((s) => structuredClone(s));
    tick(30 * MIN);
    pause(running, settings, now());
    advance(running, settings, now());
    skip(running, settings, now());
    resume(paused, settings, now());
    skip(paused, settings, now());
    reset(running, settings, now());
    expect([running, paused]).toEqual(snapshots);
  });
});
