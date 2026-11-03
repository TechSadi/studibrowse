import { describe, expect, it } from 'vitest';
import type { ProfileRecentRoom, RoomSummary } from '@studibrowse/shared';
import { hostingDetail, hoursText, profileSubtitle, recentRoomMeta, togetherText } from './format';

describe('profileSubtitle', () => {
  it('joins the username, studying line and join month', () => {
    expect(
      profileSubtitle({ username: 'mayak', studying: 'Pharmacy, year 3', joinedAt: '2026-03-14T10:00:00Z' }),
    ).toBe('@mayak · Pharmacy, year 3 · Joined March 2026');
  });

  it('leaves out an empty studying line', () => {
    expect(profileSubtitle({ username: 'mayak', studying: '', joinedAt: '2026-03-14T10:00:00Z' })).toBe(
      '@mayak · Joined March 2026',
    );
  });
});

describe('hoursText', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [2530, '42h'],
  ])('%i minutes → %s', (mins, text) => {
    expect(hoursText(mins)).toBe(text);
  });
});

describe('hostingDetail', () => {
  const now = Date.parse('2026-11-02T20:00:00Z');
  const room = {
    memberCount: 14,
    maxSize: 20,
    timer: { phase: 'focus', round: 3, endsAt: '2026-11-02T20:18:00Z', pausedRemaining: null },
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: false,
    },
  } as RoomSummary;

  it('reads like the mockup', () => {
    expect(hostingDetail(room, now)).toBe('14 of 20 studying · focus round 3 of 4 · 18 min left');
  });
});

describe('recentRoomMeta', () => {
  const now = new Date(2026, 10, 2, 20, 0);
  const base: ProfileRecentRoom = {
    roomId: 'r1',
    name: 'Late-night exam grind',
    startedAt: new Date(2026, 10, 2, 18, 0).toISOString(),
    role: 'hosted',
    hostName: null,
    people: 14,
    focusedMins: 125,
    inProgress: true,
  };

  it('says hosting for a room they’re running now', () => {
    expect(recentRoomMeta(base, now)).toBe('Today · hosting · 14 people');
  });

  it('names the host of a room they joined', () => {
    const joined = {
      ...base,
      role: 'joined' as const,
      hostName: 'Alex',
      people: 12,
      inProgress: false,
      startedAt: new Date(2026, 9, 29, 18, 0).toISOString(),
    };
    expect(recentRoomMeta(joined, now)).toBe('Thu 29 Oct · joined Alex · 12 people');
  });

  it('says yesterday and hosted for a finished room', () => {
    const yesterday = {
      ...base,
      inProgress: false,
      people: 1,
      startedAt: new Date(2026, 10, 1, 9).toISOString(),
    };
    expect(recentRoomMeta(yesterday, now)).toBe('Yesterday · hosted · just them');
  });
});

describe('togetherText', () => {
  it('uses the first name and pluralises', () => {
    expect(togetherText('Maya Kapoor', 6)).toBe('You and Maya studied together in 6 rooms.');
    expect(togetherText('Maya Kapoor', 1)).toBe('You and Maya studied together in 1 room.');
  });

  it('says nothing for 0 or your own profile', () => {
    expect(togetherText('Maya Kapoor', 0)).toBeNull();
    expect(togetherText('Maya Kapoor', null)).toBeNull();
  });
});
