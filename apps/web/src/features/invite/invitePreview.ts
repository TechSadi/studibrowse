import type { InvitePreviewResponse, RoomTimer, TimerSettings } from '@studibrowse/shared';
import { timerView } from '../room/timerView';

/** Where an invite sends you after signing up or logging in: back here, which then opens the room. */
export function invitePath(code: string): string {
  return `/r/${code}`;
}

export function authPathFor(page: 'signup' | 'login', code: string): string {
  return `/${page}?next=${encodeURIComponent(invitePath(code))}`;
}

export function roomPathFor(roomId: string, code: string): string {
  return `/room/${roomId}?invite=${encodeURIComponent(code)}`;
}

export interface InviteStats {
  /** "Focus", "Short break", "Paused", "Not started", "Finished". */
  phase: string;
  /** "18:12", or "—" when no phase is under way. */
  timeLeft: string;
  /** "3 of 4". */
  round: string;
}

/** The invite's three tiles: Right now, Time left, Round. The time left is worked out from `endsAt`. */
export function inviteStats(timer: RoomTimer, settings: TimerSettings, now: number): InviteStats {
  const total = settings.totalRounds;
  if (timer.phase === 'idle') return { phase: 'Not started', timeLeft: '—', round: `0 of ${total}` };
  if (timer.phase === 'done') return { phase: 'Finished', timeLeft: '—', round: `${total} of ${total}` };

  const leftMs = timer.endsAt ? Date.parse(timer.endsAt) - now : timer.pausedRemaining;
  const view = timerView(timer, settings, leftMs);
  return {
    phase: view.paused ? 'Paused' : view.label,
    timeLeft: view.clock,
    round: `${timer.round} of ${total}`,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The line under the avatars: when the next break starts, or that now is a good time to come in. */
export function joinHint(timer: RoomTimer): string | null {
  if (!timer.endsAt) return null;
  if (timer.phase === 'focus') {
    const at = new Date(timer.endsAt);
    return `Join during the break at ${at.getHours()}:${pad(at.getMinutes())}`;
  }
  if (timer.phase === 'shortBreak' || timer.phase === 'longBreak')
    return 'On a break now, a good time to join';
  return null;
}

/** "Hosts about 3 rooms a week", or null for someone who hasn't hosted lately. */
export function roomsPerWeekText(roomsPerWeek: number): string | null {
  if (roomsPerWeek < 1) return null;
  return `Hosts about ${roomsPerWeek} room${roomsPerWeek === 1 ? '' : 's'} a week`;
}

const MAX_REFETCH_MS = 30_000;

/**
 * How long until the preview is fetched again: every 30 s for the people count, and just after the current
 * phase ends so the phase and time left move on. False once the room is closed.
 */
export function refetchDelay(data: InvitePreviewResponse | undefined, now: number): number | false {
  if (!data || data.status === 'closed') return false;
  const { endsAt } = data.room.timer;
  if (!endsAt) return MAX_REFETCH_MS;
  return Math.min(MAX_REFETCH_MS, Math.max(1000, Date.parse(endsAt) - now + 1000));
}
