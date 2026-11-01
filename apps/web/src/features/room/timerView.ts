import type { RoomTimer, TimerPhase, TimerSettings } from '@studibrowse/shared';

export type TimerTone = 'focus' | 'break' | 'done';

/** One mark per focus round under the clock: done, the one in progress, or still to come. */
export type RoundDot = 'done' | 'now' | 'todo';

export interface TimerView {
  /** The phase pill: "Focus", "Short break", "Long break", "Session complete". */
  label: string;
  tone: TimerTone;
  /** "14:32", or "Done" once the run is over. */
  clock: string;
  /** "Round 2 of 4", "Round 2 of 4 · paused", "4 rounds finished". */
  detail: string;
  /** Share of the phase still to go, 0..1. The ring draws this much. */
  remaining: number;
  dots: RoundDot[];
  running: boolean;
  paused: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

const LABELS: Record<TimerPhase, string> = {
  idle: 'Ready to start',
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
  done: 'Session complete',
};

/** 872_400 ms → "14:33". Rounds up, so the clock reads 00:00 only when the phase is over. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function phaseMs(phase: TimerPhase, settings: TimerSettings): number {
  if (phase === 'shortBreak') return settings.shortBreakMins * 60_000;
  if (phase === 'longBreak') return settings.longBreakMins * 60_000;
  return settings.focusMins * 60_000;
}

function roundDots(timer: RoomTimer, total: number): RoundDot[] {
  const onBreak = timer.phase === 'shortBreak' || timer.phase === 'longBreak';
  return Array.from({ length: total }, (_, i) => {
    const round = i + 1;
    if (timer.phase === 'idle') return 'todo';
    if (timer.phase === 'done' || round < timer.round || (round === timer.round && onBreak)) return 'done';
    return round === timer.round ? 'now' : 'todo';
  });
}

/** What the focus room's timer shows, from the server's timer and the time left (see useRoomTimer). */
export function timerView(timer: RoomTimer, settings: TimerSettings, remainingMs: number | null): TimerView {
  const total = settings.totalRounds;
  const base = { label: LABELS[timer.phase], dots: roundDots(timer, total) };

  if (timer.phase === 'done') {
    return {
      ...base,
      tone: 'done',
      clock: 'Done',
      detail: `${total} round${total === 1 ? '' : 's'} finished`,
      remaining: 1,
      running: false,
      paused: false,
    };
  }
  if (timer.phase === 'idle') {
    return {
      ...base,
      tone: 'focus',
      clock: formatClock(phaseMs('focus', settings)),
      detail: `Round 1 of ${total}`,
      remaining: 1,
      running: false,
      paused: false,
    };
  }

  const length = phaseMs(timer.phase, settings);
  const left = remainingMs ?? length;
  const running = timer.endsAt !== null;
  return {
    ...base,
    tone: timer.phase === 'focus' ? 'focus' : 'break',
    clock: formatClock(left),
    detail: `Round ${timer.round} of ${total}${running ? '' : ' · paused'}`,
    remaining: length > 0 ? Math.min(1, left / length) : 0,
    running,
    paused: !running,
  };
}

/** The tab title: the time left while a phase runs, so it can be read from another tab. */
export function timerTitle(view: TimerView, roomName: string): string {
  if (view.running) return `${view.clock} · ${view.label} · ${roomName}`;
  if (view.paused) return `Paused ${view.clock} · ${roomName}`;
  return `${roomName} · StudiBrowse`;
}

/** The host just started a run (Start, or Start again once it's done), which is when the start sound plays. */
export function isFocusStart(previous: TimerPhase, next: TimerPhase): boolean {
  return (previous === 'idle' || previous === 'done') && next === 'focus';
}

/** A focus round or a break just ended (on its own or skipped), which is when the chime plays. */
export function isRoundEnd(previous: TimerPhase, next: TimerPhase): boolean {
  if (previous === 'focus') return next === 'shortBreak' || next === 'longBreak' || next === 'done';
  const wasBreak = previous === 'shortBreak' || previous === 'longBreak';
  return wasBreak && next === 'focus';
}
