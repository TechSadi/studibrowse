import { afterEach, describe, expect, it } from 'vitest';
import type { MemberStatus } from '@studibrowse/shared';
import {
  addSocket,
  applyPhaseStatus,
  countMembers,
  drainFocus,
  fullRoomIds,
  hasConnectedSockets,
  isMember,
  isSocketInRoom,
  listMembers,
  longestPresentMember,
  memberPreview,
  removeMember,
  removeSocket,
  resetPresence,
  roomsOfSocket,
  setFocusRunning,
  setHost,
  setStatus,
} from './presence';

afterEach(resetPresence);

const at = (seconds: number) => new Date(seconds * 1000);

function join(
  roomId: string,
  userId: string,
  socketId: string,
  {
    maxSize = 20,
    now = at(0),
    status = 'focusing' as MemberStatus,
    hostId = 'host',
    focusRunning = false,
  } = {},
) {
  return addSocket(roomId, socketId, {
    userId,
    profile: { name: userId, username: userId, avatarColor: 'green' },
    status,
    maxSize,
    hostId,
    focusRunning,
    now,
  });
}

describe('presence', () => {
  it('reports 0 members for a room nobody has joined', () => {
    expect(countMembers('room-1')).toBe(0);
    expect(listMembers('room-1')).toEqual([]);
    expect(fullRoomIds()).toEqual([]);
  });

  it('counts each person once, however many tabs they have open', () => {
    expect(join('room-1', 'maya', 's1')).toBe('joined');
    expect(join('room-1', 'maya', 's2')).toBe('rejoined');
    join('room-1', 'jordan', 's3');
    expect(countMembers('room-1')).toBe(2);
    expect(listMembers('room-1')).toHaveLength(2);
  });

  it('turns away a new person when the room is full, but lets a member open another tab', () => {
    join('room-1', 'maya', 's1', { maxSize: 2 });
    join('room-1', 'jordan', 's2', { maxSize: 2 });
    expect(join('room-1', 'alex', 's3', { maxSize: 2 })).toBe('full');
    expect(join('room-1', 'maya', 's4', { maxSize: 2 })).toBe('rejoined');
    expect(isMember('room-1', 'alex')).toBe(false);
    expect(isSocketInRoom('room-1', 's3')).toBe(false);
  });

  it('keeps a seat for someone whose last tab dropped until they are removed', () => {
    join('room-1', 'maya', 's1', { maxSize: 2 });
    join('room-1', 'jordan', 's2', { maxSize: 2 });
    expect(removeSocket('room-1', 'maya', 's1')).toBe(0);
    expect(hasConnectedSockets('room-1')).toBe(true);
    expect(join('room-1', 'alex', 's3', { maxSize: 2 })).toBe('full');

    removeMember('room-1', 'maya');
    expect(join('room-1', 'alex', 's3', { maxSize: 2 })).toBe('joined');
  });

  it('keeps joinedAt, status and note when someone comes back', () => {
    join('room-1', 'maya', 's1', { now: at(10) });
    setStatus('room-1', 'maya', { status: 'away', workingOn: 'Chapter 4' }, at(20));
    removeSocket('room-1', 'maya', 's1');

    join('room-1', 'maya', 's2', { now: at(30) });
    expect(listMembers('room-1')[0]).toMatchObject({
      joinedAt: at(10).toISOString(),
      status: 'away',
      workingOn: 'Chapter 4',
    });
  });

  it('counts the sockets a user has left in a room', () => {
    join('room-1', 'maya', 's1');
    join('room-1', 'maya', 's2');
    expect(removeSocket('room-1', 'maya', 's1')).toBe(1);
    expect(removeSocket('room-1', 'maya', 's2')).toBe(0);
    expect(hasConnectedSockets('room-1')).toBe(false);
    expect(isMember('room-1', 'maya')).toBe(true);
  });

  it('tracks which rooms each socket is in', () => {
    join('room-1', 'maya', 's1');
    join('room-2', 'maya', 's1');
    expect(roomsOfSocket('s1').sort()).toEqual(['room-1', 'room-2']);
    removeSocket('room-1', 'maya', 's1');
    expect(roomsOfSocket('s1')).toEqual(['room-2']);
    removeMember('room-2', 'maya');
    expect(roomsOfSocket('s1')).toEqual([]);
  });

  it('lists members longest present first, with the host marked', () => {
    join('room-1', 'jordan', 's2', { now: at(20), hostId: 'maya' });
    join('room-1', 'maya', 's1', { now: at(10), hostId: 'maya' });
    join('room-1', 'alex', 's3', { now: at(30), hostId: 'maya' });

    expect(listMembers('room-1').map(({ userId, isHost }) => [userId, isHost])).toEqual([
      ['maya', true],
      ['jordan', false],
      ['alex', false],
    ]);
    expect(longestPresentMember('room-1')).toBe('maya');

    removeMember('room-1', 'maya');
    expect(longestPresentMember('room-1')).toBe('jordan');
    setHost('room-1', 'jordan');
    expect(listMembers('room-1')[0]).toMatchObject({ userId: 'jordan', isHost: true });
  });

  it('keeps the store’s host while people are in the room, and takes the database’s once it empties', () => {
    join('room-1', 'maya', 's1', { hostId: 'maya' });
    setHost('room-1', 'jordan');
    join('room-1', 'jordan', 's2', { hostId: 'maya' });
    expect(listMembers('room-1').find((m) => m.isHost)?.userId).toBe('jordan');

    resetPresence();
    join('room-1', 'maya', 's1', { hostId: 'maya' });
    expect(listMembers('room-1')[0]?.isHost).toBe(true);
  });

  it('sets focusingSince when someone starts focusing and clears it otherwise', () => {
    join('room-1', 'maya', 's1', { status: 'break', now: at(0) });
    expect(listMembers('room-1')[0]?.focusingSince).toBeNull();

    setStatus('room-1', 'maya', { status: 'focusing' }, at(5));
    expect(listMembers('room-1')[0]?.focusingSince).toBe(at(5).toISOString());

    // A note change alone doesn't restart the clock.
    setStatus('room-1', 'maya', { workingOn: 'Essay' }, at(9));
    setStatus('room-1', 'maya', { status: 'focusing' }, at(9));
    expect(listMembers('room-1')[0]).toMatchObject({
      workingOn: 'Essay',
      focusingSince: at(5).toISOString(),
    });

    setStatus('room-1', 'maya', { status: 'away', workingOn: '' }, at(12));
    expect(listMembers('room-1')[0]).toMatchObject({ status: 'away', workingOn: '', focusingSince: null });
  });

  it('lists rooms that are at capacity', () => {
    join('room-1', 'maya', 's1', { maxSize: 2 });
    join('room-1', 'jordan', 's2', { maxSize: 2 });
    join('room-2', 'alex', 's3', { maxSize: 2 });
    expect(fullRoomIds()).toEqual(['room-1']);
    removeMember('room-1', 'jordan');
    expect(fullRoomIds()).toEqual([]);
  });

  it('forgets a room once its last member is removed', () => {
    join('room-1', 'maya', 's1');
    expect(removeMember('room-1', 'maya')).toBe(true);
    expect(removeMember('room-1', 'maya')).toBe(false);
    expect(countMembers('room-1')).toBe(0);
    expect(isSocketInRoom('room-1', 's1')).toBe(false);
  });
});

describe('applyPhaseStatus', () => {
  it('moves everyone with the timer but leaves Away alone', () => {
    join('room-1', 'maya', 's1', { status: 'break' });
    join('room-1', 'jordan', 's2', { status: 'break' });
    join('room-1', 'alex', 's3', { status: 'away' });

    expect(applyPhaseStatus('room-1', 'focus', at(10))).toBe(true);
    expect(listMembers('room-1').map((m) => [m.userId, m.status, m.focusingSince])).toEqual([
      ['maya', 'focusing', at(10).toISOString()],
      ['jordan', 'focusing', at(10).toISOString()],
      ['alex', 'away', null],
    ]);

    expect(applyPhaseStatus('room-1', 'shortBreak', at(20))).toBe(true);
    expect(listMembers('room-1').map((m) => [m.status, m.focusingSince])).toEqual([
      ['break', null],
      ['break', null],
      ['away', null],
    ]);
  });

  it('reports no change when everyone already follows the phase', () => {
    join('room-1', 'maya', 's1', { status: 'focusing', now: at(3) });
    expect(applyPhaseStatus('room-1', 'focus', at(10))).toBe(false);
    // Already focusing, so their focus time keeps counting from when it started.
    expect(listMembers('room-1')[0]!.focusingSince).toBe(at(3).toISOString());
    expect(applyPhaseStatus('missing', 'idle', at(10))).toBe(false);
  });
});

describe('focus accrual', () => {
  const MIN = 60_000;
  const atMin = (minutes: number) => new Date(minutes * MIN);
  const credits = (minutes: number, userId?: string) =>
    Object.fromEntries(
      drainFocus('room-1', atMin(minutes), userId).map((c) => [c.userId, c.focusedMs / MIN]),
    );

  /** A focus phase running from `startMin`, with everyone listed already in the room and Focusing. */
  function focusFrom(startMin: number, ...userIds: string[]) {
    userIds.forEach((userId) => join('room-1', userId, `s-${userId}`, { now: atMin(0), status: 'focusing' }));
    setFocusRunning('room-1', true, atMin(startMin));
  }

  it('credits a whole focus round to everyone who was there for it', () => {
    focusFrom(0, 'maya', 'jordan');
    setFocusRunning('room-1', false, atMin(25));
    expect(credits(25)).toEqual({ maya: 25, jordan: 25 });
  });

  it('never credits the same time twice', () => {
    focusFrom(0, 'maya');
    expect(credits(10)).toEqual({ maya: 10 });
    expect(credits(10)).toEqual({});
    expect(credits(25)).toEqual({ maya: 15 });
  });

  it('credits a late joiner only from when they arrived', () => {
    focusFrom(0, 'maya');
    join('room-1', 'jordan', 's-jordan', { now: atMin(18) });
    expect(credits(25)).toEqual({ maya: 25, jordan: 7 });
  });

  it('starts counting a room’s first joiner when its timer is already in focus', () => {
    join('room-1', 'maya', 's1', { now: atMin(0) });
    expect(credits(5)).toEqual({});

    resetPresence();
    join('room-1', 'maya', 's1', { now: atMin(3), focusRunning: true });
    expect(credits(5)).toEqual({ maya: 2 });
  });

  it('leaves out paused time', () => {
    focusFrom(0, 'maya');
    setFocusRunning('room-1', false, atMin(10)); // pause
    setFocusRunning('room-1', true, atMin(40)); // resume half an hour later
    expect(credits(55)).toEqual({ maya: 25 });
  });

  it('counts nothing during a break', () => {
    join('room-1', 'maya', 's1', { status: 'break', now: atMin(0) });
    applyPhaseStatus('room-1', 'shortBreak', atMin(0));
    expect(credits(5)).toEqual({});
  });

  it('follows the phase: counts from when focus begins and stops when the break starts', () => {
    join('room-1', 'maya', 's1', { status: 'break', now: atMin(0) });
    // A break ends at minute 5 and focus round 2 starts.
    applyPhaseStatus('room-1', 'focus', atMin(5));
    setFocusRunning('room-1', true, atMin(5));
    // It ends at 30 and the next break starts.
    setFocusRunning('room-1', false, atMin(30));
    applyPhaseStatus('room-1', 'shortBreak', atMin(30));
    expect(credits(35)).toEqual({ maya: 25 });
  });

  it('stops counting while someone is Away and starts again when they are back', () => {
    focusFrom(0, 'maya');
    setStatus('room-1', 'maya', { status: 'away' }, atMin(5));
    setStatus('room-1', 'maya', { status: 'focusing' }, atMin(15));
    // A note change alone doesn't touch the count.
    setStatus('room-1', 'maya', { workingOn: 'Essay' }, atMin(20));
    expect(credits(25)).toEqual({ maya: 15 });
  });

  it('banks the time of someone leaving mid-focus, for a drain of just them', () => {
    focusFrom(0, 'maya', 'jordan');
    removeSocket('room-1', 'jordan', 's-jordan', atMin(12));
    // Asked later (the save runs after they left), they still get exactly the 12 minutes they were there.
    expect(credits(20, 'jordan')).toEqual({ jordan: 12 });
    removeMember('room-1', 'jordan');
    expect(credits(25)).toEqual({ maya: 25 });
  });

  it('stops counting while someone’s connection is down and resumes when they reconnect', () => {
    focusFrom(0, 'maya');
    removeSocket('room-1', 'maya', 's-maya', atMin(10));
    expect(credits(12)).toEqual({ maya: 10 });
    // Back inside the reconnect window: same place, counting again from now.
    expect(join('room-1', 'maya', 's-maya-2', { now: atMin(14) })).toBe('rejoined');
    expect(credits(25)).toEqual({ maya: 11 });
  });

  it('keeps counting while one of several tabs is still open', () => {
    focusFrom(0, 'maya');
    join('room-1', 'maya', 's-maya-2', { now: atMin(1) });
    removeSocket('room-1', 'maya', 's-maya', atMin(5));
    expect(credits(25)).toEqual({ maya: 25 });
  });

  it('does not double count someone who leaves and comes back in the same phase', () => {
    focusFrom(0, 'maya');
    removeSocket('room-1', 'maya', 's-maya', atMin(8));
    expect(credits(8, 'maya')).toEqual({ maya: 8 });
    removeMember('room-1', 'maya');
    // The room emptied, so rejoining brings it back with the timer's state, as room:join does.
    join('room-1', 'maya', 's-maya-2', { now: atMin(20), focusRunning: true });
    expect(credits(25)).toEqual({ maya: 5 });
  });

  it('gives nothing for a room or person it doesn’t know', () => {
    expect(drainFocus('missing', atMin(5))).toEqual([]);
    focusFrom(0, 'maya');
    expect(drainFocus('room-1', atMin(5), 'jordan')).toEqual([]);
  });
});

describe('memberPreview', () => {
  it('previews the first people in, longest present first, with only name and colour', () => {
    join('room-1', 'maya', 's1', { now: at(30) });
    join('room-1', 'jordan', 's2', { now: at(10) });
    join('room-1', 'alex', 's3', { now: at(20) });
    expect(memberPreview('room-1', 2)).toEqual([
      { name: 'jordan', avatarColor: 'green' },
      { name: 'alex', avatarColor: 'green' },
    ]);
    expect(memberPreview('room-2', 4)).toEqual([]);
  });
});
