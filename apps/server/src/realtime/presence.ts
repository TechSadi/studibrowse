/**
 * Who is connected to each room, in memory (one server process in v1).
 *
 * Phase 1 has no sockets yet, so nothing calls addMember and every room reports 0 members. Phase 2's
 * room:join / room:leave handlers fill it in; the room list and "Has space" filter already read from here.
 */
const membersByRoom = new Map<string, Set<string>>();
const maxSizeByRoom = new Map<string, number>();

export function addMember(roomId: string, userId: string, maxSize: number): void {
  const members = membersByRoom.get(roomId) ?? new Set<string>();
  members.add(userId);
  membersByRoom.set(roomId, members);
  maxSizeByRoom.set(roomId, maxSize);
}

export function removeMember(roomId: string, userId: string): void {
  const members = membersByRoom.get(roomId);
  if (!members) return;
  members.delete(userId);
  if (members.size === 0) {
    membersByRoom.delete(roomId);
    maxSizeByRoom.delete(roomId);
  }
}

export function countMembers(roomId: string): number {
  return membersByRoom.get(roomId)?.size ?? 0;
}

/** Rooms with no space left, so the "Has space" filter can leave them out in the database query. */
export function fullRoomIds(): string[] {
  return [...membersByRoom].flatMap(([roomId, members]) =>
    members.size >= (maxSizeByRoom.get(roomId) ?? Infinity) ? [roomId] : [],
  );
}

/** For tests. */
export function resetPresence(): void {
  membersByRoom.clear();
  maxSizeByRoom.clear();
}
