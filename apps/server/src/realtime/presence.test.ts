import { afterEach, describe, expect, it } from 'vitest';
import type { MemberStatus } from '@studibrowse/shared';
import {
  addSocket,
  countMembers,
  fullRoomIds,
  hasConnectedSockets,
  isMember,
  isSocketInRoom,
  listMembers,
  longestPresentMember,
  removeMember,
  removeSocket,
  resetPresence,
  roomsOfSocket,
  setHost,
  setStatus,
} from './presence';

afterEach(resetPresence);

const at = (seconds: number) => new Date(seconds * 1000);

function join(
  roomId: string,
  userId: string,
  socketId: string,
  { maxSize = 20, now = at(0), status = 'focusing' as MemberStatus, hostId = 'host' } = {},
) {
  return addSocket(roomId, socketId, {
    userId,
    profile: { name: userId, username: userId, avatarColor: 'green' },
    status,
    maxSize,
    hostId,
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
