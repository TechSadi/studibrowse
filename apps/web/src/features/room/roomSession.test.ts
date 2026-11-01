import { describe, expect, it } from 'vitest';
import type { PresenceMember, RoomDetail, RoomJoinData, RoomResource } from '@studibrowse/shared';
import { initialRoomSession, isEnded, roomSessionReducer, type RoomSessionState } from './roomSession';

const room = {
  id: 'r1',
  name: 'Finals week focus',
  subject: '',
  description: '',
  isPublic: true,
  maxSize: 10,
  memberCount: 1,
  goals: [],
  timer: { phase: 'idle', round: 0, endsAt: null, pausedRemaining: null },
  timerSettings: {
    focusMins: 25,
    shortBreakMins: 5,
    longBreakMins: 15,
    roundsBeforeLong: 4,
    totalRounds: 4,
    autoStart: true,
  },
} as unknown as RoomDetail;

const member = (userId: string): PresenceMember => ({
  userId,
  name: userId,
  username: userId,
  avatarColor: 'green',
  status: 'break',
  workingOn: '',
  isHost: false,
  joinedAt: '2026-11-01T10:00:00.000Z',
  focusingSince: null,
});

const joinData: RoomJoinData = {
  room,
  members: [member('me')],
  resources: [],
  messages: [],
  serverNow: 1000,
};

const joined = roomSessionReducer(initialRoomSession, { type: 'joined', data: joinData });

describe('roomSessionReducer', () => {
  it('starts joining and enters the room with a timer snapshot', () => {
    expect(initialRoomSession).toEqual({ status: 'joining' });
    expect(joined).toMatchObject({
      status: 'joined',
      joined: { room, snapshot: { timer: room.timer, serverNow: 1000 } },
    });
  });

  it('maps join errors to their screens', () => {
    const fail = (code: string, from: RoomSessionState = initialRoomSession) =>
      roomSessionReducer(from, { type: 'joinFailed', code, message: 'Nope.' });
    expect(fail('ROOM_FULL')).toEqual({ status: 'full' });
    expect(fail('ROOM_CLOSED')).toEqual({ status: 'closed' });
    expect(fail('ROOM_NOT_FOUND')).toEqual({ status: 'notFound' });
    expect(fail('INTERNAL_ERROR')).toEqual({ status: 'error', message: 'Nope.' });
  });

  it('keeps the room on screen while reconnecting, then takes the fresh join', () => {
    const dropped = roomSessionReducer(joined, { type: 'disconnected' });
    expect(dropped).toMatchObject({ status: 'rejoining', joined: { room } });
    // The retry itself didn't get through: still reconnecting.
    expect(roomSessionReducer(dropped, { type: 'joinFailed', code: 'NETWORK_ERROR', message: '' })).toBe(
      dropped,
    );
    expect(roomSessionReducer(dropped, { type: 'join' })).toBe(dropped);

    const back = roomSessionReducer(dropped, { type: 'joined', data: { ...joinData, serverNow: 2000 } });
    expect(back).toMatchObject({ status: 'joined', joined: { snapshot: { serverNow: 2000 } } });
  });

  it('shows Room full if the seat was lost while away', () => {
    const dropped = roomSessionReducer(joined, { type: 'disconnected' });
    expect(roomSessionReducer(dropped, { type: 'joinFailed', code: 'ROOM_FULL', message: '' })).toEqual({
      status: 'full',
    });
  });

  it('follows presence, settings and goals', () => {
    let state = roomSessionReducer(joined, { type: 'presence', members: [member('me'), member('hana')] });
    state = roomSessionReducer(state, {
      type: 'settings',
      settings: { ...room, name: 'Exam cram', maxSize: 6 },
    });
    state = roomSessionReducer(state, {
      type: 'goals',
      goals: [{ id: 'g1', text: 'Past paper', done: true, addedBy: 'me' }],
    });
    expect(state).toMatchObject({
      status: 'joined',
      joined: {
        members: [{ userId: 'me' }, { userId: 'hana' }],
        room: { name: 'Exam cram', maxSize: 6, memberCount: 2, goals: [{ text: 'Past paper' }] },
      },
    });
  });

  it('adds shared resources once each and drops removed ones', () => {
    const notes: RoomResource = {
      id: 'r1',
      roomId: room.id,
      userId: 'hana',
      type: 'link',
      title: 'Notes',
      url: 'https://example.com',
      size: null,
      fileName: null,
      downloadUrl: null,
      thumbnailUrl: null,
      createdAt: '2026-11-01T12:00:00.000Z',
    };
    let state = roomSessionReducer(joined, { type: 'resourceAdded', resource: notes });
    state = roomSessionReducer(state, { type: 'resourceAdded', resource: notes });
    state = roomSessionReducer(state, { type: 'resourceAdded', resource: { ...notes, id: 'r2' } });
    expect(state).toMatchObject({ joined: { resources: [{ id: 'r1' }, { id: 'r2' }] } });

    state = roomSessionReducer(state, { type: 'resourceRemoved', resourceId: 'r1' });
    expect(state).toMatchObject({ joined: { resources: [{ id: 'r2' }] } });
  });

  it('ignores room updates before joining', () => {
    expect(roomSessionReducer(initialRoomSession, { type: 'presence', members: [] })).toBe(
      initialRoomSession,
    );
  });

  it('stays removed whatever happens next', () => {
    const removed = roomSessionReducer(joined, { type: 'removed' });
    expect(removed).toEqual({ status: 'removed' });
    expect(isEnded(removed)).toBe(true);
    expect(roomSessionReducer(removed, { type: 'joinFailed', code: 'ROOM_NOT_FOUND', message: '' })).toBe(
      removed,
    );
    expect(isEnded(joined)).toBe(false);
  });
});
