import type { InfiniteData } from '@tanstack/react-query';
import type { PublicRoomsResponse, RoomFilter, RoomSummary } from '@studibrowse/shared';

/** The filters Rooms worth joining asks the server for. Part of the query key. */
export interface RoomFilters {
  filter: RoomFilter;
  q: string;
  subject: string;
}

export const ALL_ROOMS: RoomFilters = { filter: 'all', q: '', subject: '' };

export type PublicRoomsData = InfiniteData<PublicRoomsResponse, number>;

/** Whether the server would list `room` for these filters. Mirrors publicRoomsMatch in rooms.service.ts. */
export function matchesRoomFilters(room: RoomSummary, { filter, q, subject }: RoomFilters): boolean {
  if (subject && room.subject.toLowerCase() !== subject.toLowerCase()) return false;
  if (q) {
    const needle = q.toLowerCase();
    if (!room.name.toLowerCase().includes(needle) && !room.subject.toLowerCase().includes(needle))
      return false;
  }
  // A paused or not-yet-started room is neither in a round nor on a break.
  const running = room.timer.endsAt !== null;
  if (filter === 'focus') return running && room.timer.phase === 'focus';
  if (filter === 'break') {
    return running && (room.timer.phase === 'shortBreak' || room.timer.phase === 'longBreak');
  }
  if (filter === 'open') return room.memberCount < room.maxSize;
  return true;
}

/** The server's order: rooms hosted by people you follow first, then newest. */
export function compareRooms(a: RoomSummary, b: RoomSummary): number {
  if (a.hostFollowed !== b.hostFollowed) return a.hostFollowed ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function withPages(data: PublicRoomsData, pages: PublicRoomsResponse[]): PublicRoomsData {
  return { ...data, pages };
}

export function removeRoom(data: PublicRoomsData, roomId: string): PublicRoomsData {
  if (!data.pages.some((page) => page.rooms.some((room) => room.id === roomId))) return data;
  return withPages(
    data,
    data.pages.map((page) => ({ ...page, rooms: page.rooms.filter((room) => room.id !== roomId) })),
  );
}

/**
 * Merges a pushed card into the loaded list. A room already listed is updated where it is, or dropped if it no
 * longer matches the filters. A new one goes where the server would put it; if that's past the last loaded
 * room and there are more pages, it's left for "Show more" to bring in.
 */
export function upsertRoom(data: PublicRoomsData, room: RoomSummary, filters: RoomFilters): PublicRoomsData {
  const listed = data.pages.some((page) => page.rooms.some((r) => r.id === room.id));
  if (!matchesRoomFilters(room, filters)) return listed ? removeRoom(data, room.id) : data;
  if (listed) {
    return withPages(
      data,
      data.pages.map((page) => ({ ...page, rooms: page.rooms.map((r) => (r.id === room.id ? room : r)) })),
    );
  }

  for (const [index, page] of data.pages.entries()) {
    const at = page.rooms.findIndex((r) => compareRooms(room, r) < 0);
    const isLast = index === data.pages.length - 1;
    if (at === -1 && !(isLast && page.nextPage === null)) continue;
    const rooms = [...page.rooms];
    rooms.splice(at === -1 ? rooms.length : at, 0, room);
    return withPages(
      data,
      data.pages.map((p, i) => (i === index ? { ...p, rooms } : p)),
    );
  }
  return data;
}

/**
 * The room the hero's Happening now card shows: the first one (in list order) whose timer is running, else the
 * first with people in it. Null when nobody is studying anywhere.
 */
export function pickHappeningNow(rooms: RoomSummary[]): RoomSummary | null {
  return (
    rooms.find((room) => room.isLive && room.timer.endsAt !== null) ??
    rooms.find((room) => room.isLive) ??
    null
  );
}
