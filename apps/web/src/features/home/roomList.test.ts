import { describe, expect, it } from 'vitest';
import type { PublicRoomsResponse, RoomSummary } from '@studibrowse/shared';
import {
  ALL_ROOMS,
  compareRooms,
  matchesRoomFilters,
  pickHappeningNow,
  removeRoom,
  upsertRoom,
  type PublicRoomsData,
  type RoomFilters,
} from './roomList';

const LATER = '2026-11-01T12:30:00.000Z';

function room(id: string, overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id,
    name: `Room ${id}`,
    subject: 'Maths',
    host: { id: 'u2', name: 'Maya Kapoor', username: 'maya', avatarColor: 'gold' },
    isPublic: true,
    maxSize: 10,
    memberCount: 3,
    isLive: true,
    timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: false,
    },
    createdAt: '2026-11-01T10:00:00.000Z',
    hostFollowed: false,
    ...overrides,
  };
}

function data(...pages: { rooms: RoomSummary[]; nextPage?: number | null }[]): PublicRoomsData {
  const full: PublicRoomsResponse[] = pages.map(({ rooms, nextPage = null }) => ({ rooms, nextPage }));
  return { pages: full, pageParams: full.map((_, i) => i + 1) };
}

const ids = (list: PublicRoomsData) => list.pages.map((page) => page.rooms.map((r) => r.id));

const running = { phase: 'focus', round: 1, endsAt: LATER, pausedRemaining: null } as const;

describe('matchesRoomFilters', () => {
  const filters = (changes: Partial<RoomFilters>): RoomFilters => ({ ...ALL_ROOMS, ...changes });

  it('matches the subject exactly, in any case', () => {
    expect(matchesRoomFilters(room('a'), filters({ subject: 'maths' }))).toBe(true);
    expect(matchesRoomFilters(room('a'), filters({ subject: 'Math' }))).toBe(false);
  });

  it('searches the name and subject', () => {
    expect(matchesRoomFilters(room('a', { name: 'Exam cram' }), filters({ q: 'CRAM' }))).toBe(true);
    expect(matchesRoomFilters(room('a'), filters({ q: 'mat' }))).toBe(true);
    expect(matchesRoomFilters(room('a'), filters({ q: 'physics' }))).toBe(false);
  });

  it('counts only a running focus phase as in a focus round', () => {
    expect(matchesRoomFilters(room('a', { timer: running }), filters({ filter: 'focus' }))).toBe(true);
    const paused = { ...running, endsAt: null, pausedRemaining: 60_000 };
    expect(matchesRoomFilters(room('a', { timer: paused }), filters({ filter: 'focus' }))).toBe(false);
    expect(matchesRoomFilters(room('a'), filters({ filter: 'focus' }))).toBe(false);
  });

  it('counts a running short or long break as on a break', () => {
    for (const phase of ['shortBreak', 'longBreak'] as const) {
      expect(
        matchesRoomFilters(room('a', { timer: { ...running, phase } }), filters({ filter: 'break' })),
      ).toBe(true);
    }
    expect(matchesRoomFilters(room('a', { timer: running }), filters({ filter: 'break' }))).toBe(false);
  });

  it('leaves full rooms out of Has space', () => {
    expect(matchesRoomFilters(room('a', { memberCount: 9 }), filters({ filter: 'open' }))).toBe(true);
    expect(matchesRoomFilters(room('a', { memberCount: 10 }), filters({ filter: 'open' }))).toBe(false);
  });
});

describe('compareRooms', () => {
  it('puts rooms by people you follow first, then the newest', () => {
    const older = room('a', { createdAt: '2026-11-01T09:00:00.000Z' });
    const newer = room('b', { createdAt: '2026-11-01T11:00:00.000Z' });
    const followed = room('c', { hostFollowed: true, createdAt: '2026-11-01T08:00:00.000Z' });
    expect([older, newer, followed].sort(compareRooms).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('upsertRoom', () => {
  it('updates a listed room in place', () => {
    const list = data({ rooms: [room('a'), room('b'), room('c')] });
    const next = upsertRoom(list, room('b', { memberCount: 7 }), ALL_ROOMS);

    expect(ids(next)).toEqual([['a', 'b', 'c']]);
    expect(next.pages[0]!.rooms[1]!.memberCount).toBe(7);
  });

  it('puts a new room first among people you don’t follow, after the ones you do', () => {
    const list = data({
      rooms: [room('f', { hostFollowed: true }), room('a', { createdAt: '2026-11-01T09:00:00.000Z' })],
    });
    const next = upsertRoom(list, room('new', { createdAt: LATER }), ALL_ROOMS);

    expect(ids(next)).toEqual([['f', 'new', 'a']]);
  });

  it('puts a new room by someone you follow at the top', () => {
    const list = data({ rooms: [room('f', { hostFollowed: true }), room('a')] });
    const next = upsertRoom(list, room('new', { hostFollowed: true, createdAt: LATER }), ALL_ROOMS);

    expect(ids(next)).toEqual([['new', 'f', 'a']]);
  });

  it('adds a room older than everything loaded to the end of the last page', () => {
    const list = data({ rooms: [room('a')] });
    const next = upsertRoom(list, room('old', { createdAt: '2026-10-01T10:00:00.000Z' }), ALL_ROOMS);

    expect(ids(next)).toEqual([['a', 'old']]);
  });

  it('leaves a room that belongs on a page not loaded yet for Show more', () => {
    const list = data({ rooms: [room('a')], nextPage: 2 });
    const old = room('old', { createdAt: '2026-10-01T10:00:00.000Z' });

    expect(upsertRoom(list, old, ALL_ROOMS)).toBe(list);
  });

  it('inserts into the page the room belongs in', () => {
    const list = data(
      { rooms: [room('a', { createdAt: '2026-11-01T11:00:00.000Z' })], nextPage: 2 },
      { rooms: [room('b', { createdAt: '2026-11-01T09:00:00.000Z' })] },
    );
    const next = upsertRoom(list, room('mid', { createdAt: '2026-11-01T10:00:00.000Z' }), ALL_ROOMS);

    expect(ids(next)).toEqual([['a'], ['mid', 'b']]);
  });

  it('ignores a new room that doesn’t match the filters', () => {
    const list = data({ rooms: [] });
    const focus: RoomFilters = { ...ALL_ROOMS, filter: 'focus' };

    expect(upsertRoom(list, room('new'), focus)).toBe(list);
  });

  it('drops a listed room that no longer matches the filters', () => {
    const focus: RoomFilters = { ...ALL_ROOMS, filter: 'focus' };
    const list = data({ rooms: [room('a', { timer: running }), room('b', { timer: running })] });
    const onBreak = room('a', { timer: { ...running, phase: 'shortBreak' } });

    expect(ids(upsertRoom(list, onBreak, focus))).toEqual([['b']]);
  });
});

describe('removeRoom', () => {
  it('takes the room out of whichever page holds it', () => {
    const list = data({ rooms: [room('a')], nextPage: 2 }, { rooms: [room('b'), room('c')] });
    expect(ids(removeRoom(list, 'b'))).toEqual([['a'], ['c']]);
  });

  it('leaves the list alone for a room it doesn’t have', () => {
    const list = data({ rooms: [room('a')] });
    expect(removeRoom(list, 'zzz')).toBe(list);
  });
});

describe('pickHappeningNow', () => {
  it('picks the first room whose timer is running', () => {
    const rooms = [room('idle'), room('run1', { timer: running }), room('run2', { timer: running })];
    expect(pickHappeningNow(rooms)?.id).toBe('run1');
  });

  it('falls back to the first room with people in it', () => {
    const empty = room('empty', { memberCount: 0, isLive: false, timer: running });
    expect(pickHappeningNow([empty, room('idle')])?.id).toBe('idle');
  });

  it('is null when nobody is studying anywhere', () => {
    expect(pickHappeningNow([room('empty', { memberCount: 0, isLive: false })])).toBeNull();
    expect(pickHappeningNow([])).toBeNull();
  });
});
