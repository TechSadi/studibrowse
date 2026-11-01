// The shared timer's phase and round maths. Pure: no I/O, no clock reads; every function takes `now` and returns a
// new state. See docs/ARCHITECTURE.md › Timer.
import type { TimerPhase, TimerSettings } from '@studibrowse/shared';
import { invalidTimerCommand } from '../modules/rooms/rooms.errors';

/**
 * Running: `endsAt` is set, `pausedRemaining` is null. Paused: `endsAt` is null, `pausedRemaining` holds the ms
 * left. `idle` and `done`: both null.
 */
export interface TimerState {
  phase: TimerPhase;
  round: number;
  endsAt: Date | null;
  pausedRemaining: number | null;
}

type ActivePhase = Exclude<TimerPhase, 'idle' | 'done'>;

const MINUTE_MS = 60_000;

export function idleTimer(): TimerState {
  return { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null };
}

export function phaseDurationMs(phase: ActivePhase, settings: TimerSettings): number {
  if (phase === 'shortBreak') return settings.shortBreakMins * MINUTE_MS;
  if (phase === 'longBreak') return settings.longBreakMins * MINUTE_MS;
  return settings.focusMins * MINUTE_MS;
}

export function isRunning(state: TimerState): boolean {
  return state.endsAt !== null;
}

export function isPaused(state: TimerState): boolean {
  return state.endsAt === null && state.pausedRemaining !== null;
}

function isActive(state: TimerState): state is TimerState & { phase: ActivePhase } {
  return state.phase !== 'idle' && state.phase !== 'done';
}

function running(phase: ActivePhase, round: number, endsAt: number): TimerState {
  return { phase, round, endsAt: new Date(endsAt), pausedRemaining: null };
}

function waiting(phase: ActivePhase, round: number, settings: TimerSettings): TimerState {
  return { phase, round, endsAt: null, pausedRemaining: phaseDurationMs(phase, settings) };
}

/** From idle, or from done ("Start again"): a fresh run from focus round 1. */
export function start(state: TimerState, settings: TimerSettings, now: Date): TimerState {
  if (isActive(state)) throw invalidTimerCommand('The timer has already started.');
  return running('focus', 1, now.getTime() + phaseDurationMs('focus', settings));
}

export function pause(state: TimerState, _settings: TimerSettings, now: Date): TimerState {
  if (!isActive(state) || !state.endsAt) throw invalidTimerCommand('The timer isn’t running.');
  const left = Math.max(0, state.endsAt.getTime() - now.getTime());
  return { ...state, endsAt: null, pausedRemaining: left };
}

export function resume(state: TimerState, _settings: TimerSettings, now: Date): TimerState {
  if (!isActive(state) || state.pausedRemaining === null || state.endsAt) {
    throw invalidTimerCommand('The timer isn’t paused.');
  }
  return running(state.phase, state.round, now.getTime() + state.pausedRemaining);
}

/**
 * Ends the current phase now. A running timer moves on as if the phase had ended (following autoStart); a paused
 * one stays paused, at the full length of the next phase.
 */
export function skip(state: TimerState, settings: TimerSettings, now: Date): TimerState {
  if (!isActive(state)) throw invalidTimerCommand('There’s no phase to skip.');
  const autoStart = isRunning(state) && settings.autoStart;
  return nextPhase(state, settings, now.getTime(), autoStart);
}

/** Back to idle from anywhere. Takes the same arguments as the other commands so they share one shape. */
export function reset(_state: TimerState, _settings: TimerSettings, _now: Date): TimerState {
  return idleTimer();
}

/**
 * What happens when `endsAt` passes. Returns the state unchanged if nothing is due, so an early or repeated
 * timeout is harmless. The next phase is timed from the previous `endsAt`, not `now`, so a late timeout doesn't
 * drift; after a long outage (a restart) it catches up through every phase that should have ended.
 */
export function advance(state: TimerState, settings: TimerSettings, now: Date): TimerState {
  return advanceSteps(state, settings, now).at(-1) ?? state;
}

/**
 * The phases `advance` passes through, in order, ending with the state it returns. Empty when nothing is due.
 * Each phase that ended did so at the previous state's `endsAt`.
 */
export function advanceSteps(state: TimerState, settings: TimerSettings, now: Date): TimerState[] {
  const steps: TimerState[] = [];
  let current = state;
  while (isActive(current) && current.endsAt && current.endsAt.getTime() <= now.getTime()) {
    current = nextPhase(current, settings, current.endsAt.getTime(), settings.autoStart);
    steps.push(current);
  }
  return steps;
}

/** How much of the current focus phase has run so far (pauses excluded). 0 outside a focus phase. */
export function focusRunMs(state: TimerState, settings: TimerSettings, now: Date): number {
  if (state.phase !== 'focus') return 0;
  const duration = phaseDurationMs('focus', settings);
  const left = state.endsAt ? state.endsAt.getTime() - now.getTime() : (state.pausedRemaining ?? duration);
  return Math.min(duration, Math.max(0, duration - left));
}

/**
 * Focus round r → done after the last round, else a long break every `roundsBeforeLong` rounds, else a short one.
 * A break → focus round r + 1. With `autoStart` off the next phase waits, paused at full length, for the host.
 */
function nextPhase(
  state: TimerState & { phase: ActivePhase },
  settings: TimerSettings,
  from: number,
  autoStart: boolean,
): TimerState {
  let phase: ActivePhase;
  let round = state.round;
  if (state.phase === 'focus') {
    if (round >= settings.totalRounds) {
      return { phase: 'done', round: settings.totalRounds, endsAt: null, pausedRemaining: null };
    }
    phase = round % settings.roundsBeforeLong === 0 ? 'longBreak' : 'shortBreak';
  } else {
    phase = 'focus';
    round += 1;
  }
  return autoStart
    ? running(phase, round, from + phaseDurationMs(phase, settings))
    : waiting(phase, round, settings);
}
