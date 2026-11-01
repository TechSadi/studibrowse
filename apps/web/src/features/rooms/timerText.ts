import type { RoomTimer, TimerDefaults, TimerSettings } from '@studibrowse/shared';

const pad = (n: number) => String(n).padStart(2, '0');

/** 25 → "25m", 100 → "1h 40m", 125 → "2h 05m" (the mockup's duration format). */
export function formatMins(mins: number): string {
  const hours = Math.floor(mins / 60);
  const rest = Math.round(mins % 60);
  return hours ? `${hours}h ${pad(rest)}m` : `${rest}m`;
}

/** 720 → "12h", 90 → "1h 30m": a weekly goal is usually whole hours. */
export function formatGoal(mins: number): string {
  return mins % 60 === 0 ? `${mins / 60}h` : formatMins(mins);
}

export interface TimerPlan {
  rounds: number;
  focusMins: number;
  totalMins: number;
  /** "19:40", the end time if the timer started at `now`. */
  endsAround: string;
}

/** The Create a room summary line: all focus rounds plus the breaks between them (none after the last). */
export function timerPlan(settings: TimerDefaults, now: Date): TimerPlan {
  const focusMins = settings.focusMins * settings.totalRounds;
  let totalMins = focusMins;
  for (let round = 1; round < settings.totalRounds; round++) {
    totalMins += round % settings.roundsBeforeLong === 0 ? settings.longBreakMins : settings.shortBreakMins;
  }
  const end = new Date(now.getTime() + totalMins * 60_000);
  return {
    rounds: settings.totalRounds,
    focusMins,
    totalMins,
    endsAround: `${end.getHours()}:${pad(end.getMinutes())}`,
  };
}

export type PhaseTone = 'focus' | 'break' | 'idle';

export interface PhaseView {
  title: string;
  detail: string;
  /** Share of the current phase still to go, 0..1, for the mini ring. */
  remaining: number;
  tone: PhaseTone;
}

function phaseMins(phase: 'focus' | 'shortBreak' | 'longBreak', settings: TimerSettings): number {
  if (phase === 'shortBreak') return settings.shortBreakMins;
  if (phase === 'longBreak') return settings.longBreakMins;
  return settings.focusMins;
}

/** What a room card says about the shared timer. The time left is worked out from `endsAt`, never ticked. */
export function phaseView(timer: RoomTimer, settings: TimerSettings, now: number): PhaseView {
  if (timer.phase === 'idle') {
    return {
      title: 'Waiting to start',
      detail: `${settings.totalRounds} × ${settings.focusMins} min focus rounds`,
      remaining: 1,
      tone: 'idle',
    };
  }
  if (timer.phase === 'done') {
    // The mockup draws a finished run as a full ring.
    return {
      title: 'Session complete',
      detail: `${settings.totalRounds} rounds finished`,
      remaining: 1,
      tone: 'idle',
    };
  }

  const phaseMs = phaseMins(timer.phase, settings) * 60_000;
  const leftMs = timer.endsAt
    ? Math.max(0, Date.parse(timer.endsAt) - now)
    : (timer.pausedRemaining ?? phaseMs);
  const leftMins = Math.ceil(leftMs / 60_000);
  const remaining = phaseMs > 0 ? Math.min(1, leftMs / phaseMs) : 0;
  const rounds = `${timer.round} of ${settings.totalRounds}`;
  const onBreak = timer.phase !== 'focus';

  if (!timer.endsAt) {
    return {
      title: `Paused · ${onBreak ? 'break' : 'round'} ${rounds}`,
      detail: `${leftMins} min left`,
      remaining,
      tone: 'idle',
    };
  }
  if (onBreak) {
    return {
      title: `On a break · ${rounds}`,
      detail: `${leftMins} min left, good time to join`,
      remaining,
      tone: 'break',
    };
  }
  return { title: `Focus round · ${rounds}`, detail: `${leftMins} min left`, remaining, tone: 'focus' };
}
