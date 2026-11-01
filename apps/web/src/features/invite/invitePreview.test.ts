import { describe, expect, it } from 'vitest';
import type { InvitePreview, RoomTimer, TimerSettings } from '@studibrowse/shared';
import {
  authPathFor,
  inviteStats,
  joinHint,
  refetchDelay,
  roomPathFor,
  roomsPerWeekText,
} from './invitePreview';

const settings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};
const now = new Date(2026, 10, 1, 10, 24).getTime();
const at = (ms: number) => new Date(now + ms).toISOString();
const timer = (changes: Partial<RoomTimer>): RoomTimer => ({
  phase: 'focus',
  round: 3,
  endsAt: null,
  pausedRemaining: null,
  ...changes,
});

describe('inviteStats', () => {
  it('shows a running focus round with the time left from endsAt', () => {
    expect(inviteStats(timer({ endsAt: at(18 * 60_000 + 12_000) }), settings, now)).toEqual({
      phase: 'Focus',
      timeLeft: '18:12',
      round: '3 of 4',
    });
  });

  it('names breaks, and never counts below 00:00', () => {
    expect(inviteStats(timer({ phase: 'longBreak', endsAt: at(-5000) }), settings, now)).toEqual({
      phase: 'Long break',
      timeLeft: '00:00',
      round: '3 of 4',
    });
  });

  it('shows a paused phase with the time it was paused at', () => {
    expect(inviteStats(timer({ pausedRemaining: 90_000 }), settings, now)).toMatchObject({
      phase: 'Paused',
      timeLeft: '01:30',
    });
  });

  it('handles a run that has not started or is over', () => {
    expect(inviteStats(timer({ phase: 'idle', round: 1 }), settings, now)).toEqual({
      phase: 'Not started',
      timeLeft: '—',
      round: '0 of 4',
    });
    expect(inviteStats(timer({ phase: 'done', round: 4 }), settings, now)).toEqual({
      phase: 'Finished',
      timeLeft: '—',
      round: '4 of 4',
    });
  });
});

describe('joinHint', () => {
  it('says when the next break starts during focus', () => {
    expect(joinHint(timer({ endsAt: at(18 * 60_000) }))).toBe('Join during the break at 10:42');
  });

  it('says a running break is a good time to join', () => {
    expect(joinHint(timer({ phase: 'shortBreak', endsAt: at(60_000) }))).toBe(
      'On a break now, a good time to join',
    );
  });

  it('says nothing when the timer is not running', () => {
    expect(joinHint(timer({ pausedRemaining: 60_000 }))).toBeNull();
    expect(joinHint(timer({ phase: 'idle' }))).toBeNull();
  });
});

describe('roomsPerWeekText', () => {
  it.each([
    [0, null],
    [1, 'Hosts about 1 room a week'],
    [3, 'Hosts about 3 rooms a week'],
  ])('%i → %j', (n, text) => {
    expect(roomsPerWeekText(n)).toBe(text);
  });
});

describe('paths', () => {
  it('sends sign up and log in back to the invite', () => {
    expect(authPathFor('signup', 'aB3xK9_q-2')).toBe('/signup?next=%2Fr%2FaB3xK9_q-2');
    expect(authPathFor('login', 'aB3xK9_q-2')).toBe('/login?next=%2Fr%2FaB3xK9_q-2');
  });

  it('opens the room with the invite code', () => {
    expect(roomPathFor('room1', 'aB3xK9_q-2')).toBe('/room/room1?invite=aB3xK9_q-2');
  });
});

describe('refetchDelay', () => {
  const open = (endsAt: string | null) => ({
    status: 'open' as const,
    room: { timer: timer({ endsAt }) } as InvitePreview,
  });

  it('refetches every 30 s, or just after the phase ends if that is sooner', () => {
    expect(refetchDelay(open(null), now)).toBe(30_000);
    expect(refetchDelay(open(at(10 * 60_000)), now)).toBe(30_000);
    expect(refetchDelay(open(at(4000)), now)).toBe(5000);
    expect(refetchDelay(open(at(-60_000)), now)).toBe(1000);
  });

  it('stops for a closed room', () => {
    expect(refetchDelay(undefined, now)).toBe(false);
    const host = { id: 'h', name: 'Jordan Lee', username: 'jordan', avatarColor: 'blue' as const };
    expect(refetchDelay({ status: 'closed', room: { name: 'x', host, roomsPerWeek: 0 } }, now)).toBe(false);
  });
});
