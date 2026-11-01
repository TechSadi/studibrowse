import type { AvatarColor, MemberStatus, PresenceMember, TimerPhase } from '@studibrowse/shared';

/**
 * Who is in each room, in memory (one server process in v1). Keyed by room, then user; each user can have
 * several sockets (tabs). Someone whose last socket dropped stays here, holding their seat, until the room
 * handlers remove them after the reconnect window. This store has no timers and no database.
 */

export interface MemberProfile {
  name: string;
  username: string;
  avatarColor: AvatarColor;
}

interface Member {
  profile: MemberProfile;
  sockets: Set<string>;
  joinedAt: Date;
  status: MemberStatus;
  workingOn: string;
  focusingSince: Date | null;
}

interface RoomPresence {
  maxSize: number;
  hostId: string;
  members: Map<string, Member>;
}

const rooms = new Map<string, RoomPresence>();
const roomsBySocket = new Map<string, Set<string>>();

export interface NewSocket {
  userId: string;
  profile: MemberProfile;
  /** The status a newcomer starts with. Someone already here keeps theirs. */
  status: MemberStatus;
  maxSize: number;
  hostId: string;
  now: Date;
}

/**
 * Adds a socket to a room. 'full' when the room already holds `maxSize` people and this user isn't one of
 * them; seats are counted by person, so another tab of someone already here always gets in.
 */
export function addSocket(
  roomId: string,
  socketId: string,
  { userId, profile, status, maxSize, hostId, now }: NewSocket,
): 'joined' | 'rejoined' | 'full' {
  const room = rooms.get(roomId) ?? { maxSize, hostId, members: new Map<string, Member>() };
  room.maxSize = maxSize;
  const existing = room.members.get(userId);
  if (!existing && room.members.size >= maxSize) return 'full';

  if (existing) {
    existing.profile = profile;
    existing.sockets.add(socketId);
  } else {
    // An empty room takes the host from the database; while people are here, the store's host wins.
    if (room.members.size === 0) room.hostId = hostId;
    room.members.set(userId, {
      profile,
      sockets: new Set([socketId]),
      joinedAt: now,
      status,
      workingOn: '',
      focusingSince: status === 'focusing' ? now : null,
    });
  }
  rooms.set(roomId, room);
  const socketRooms = roomsBySocket.get(socketId) ?? new Set<string>();
  socketRooms.add(roomId);
  roomsBySocket.set(socketId, socketRooms);
  return existing ? 'rejoined' : 'joined';
}

/** Takes one socket out of a room. Returns how many sockets that user still has there. */
export function removeSocket(roomId: string, userId: string, socketId: string): number {
  const socketRooms = roomsBySocket.get(socketId);
  socketRooms?.delete(roomId);
  if (socketRooms?.size === 0) roomsBySocket.delete(socketId);

  const member = rooms.get(roomId)?.members.get(userId);
  if (!member) return 0;
  member.sockets.delete(socketId);
  return member.sockets.size;
}

/** Removes someone from a room for good. False if they weren't there. */
export function removeMember(roomId: string, userId: string): boolean {
  const room = rooms.get(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) return false;
  for (const socketId of member.sockets) removeSocket(roomId, userId, socketId);
  room.members.delete(userId);
  if (room.members.size === 0) rooms.delete(roomId);
  return true;
}

export function isMember(roomId: string, userId: string): boolean {
  return rooms.get(roomId)?.members.has(userId) ?? false;
}

export function isSocketInRoom(roomId: string, socketId: string): boolean {
  return roomsBySocket.get(socketId)?.has(roomId) ?? false;
}

export function roomsOfSocket(socketId: string): string[] {
  return [...(roomsBySocket.get(socketId) ?? [])];
}

/** Whether anyone has a socket in the room right now (people inside the reconnect window don't). */
export function hasConnectedSockets(roomId: string): boolean {
  const members = rooms.get(roomId)?.members.values() ?? [];
  return [...members].some((member) => member.sockets.size > 0);
}

export interface StatusChange {
  status?: MemberStatus;
  workingOn?: string;
}

export function setStatus(
  roomId: string,
  userId: string,
  { status, workingOn }: StatusChange,
  now: Date,
): void {
  const member = rooms.get(roomId)?.members.get(userId);
  if (!member) return;
  if (workingOn !== undefined) member.workingOn = workingOn;
  if (status !== undefined && status !== member.status) {
    member.status = status;
    member.focusingSince = status === 'focusing' ? now : null;
  }
}

/**
 * The timer moved to `phase` at `at`: everyone follows it (focus → Focusing, anything else → Break), except
 * people who set themselves Away. Returns whether anyone's status changed.
 */
export function applyPhaseStatus(roomId: string, phase: TimerPhase, at: Date): boolean {
  const status: MemberStatus = phase === 'focus' ? 'focusing' : 'break';
  let changed = false;
  for (const member of rooms.get(roomId)?.members.values() ?? []) {
    if (member.status === 'away' || member.status === status) continue;
    member.status = status;
    member.focusingSince = status === 'focusing' ? at : null;
    changed = true;
  }
  return changed;
}

/**
 * Focus time to credit when a focus phase ends at `endedAt`, having run for `runMs`: each member who is
 * Focusing gets the time since they started focusing, up to `runMs`. Away and Break members get nothing.
 */
export function focusCredits(
  roomId: string,
  endedAt: Date,
  runMs: number,
): { userId: string; focusedMs: number }[] {
  return [...(rooms.get(roomId)?.members ?? [])].flatMap(([userId, member]) => {
    if (member.status !== 'focusing' || !member.focusingSince) return [];
    const focusedMs = Math.min(runMs, endedAt.getTime() - member.focusingSince.getTime());
    return focusedMs > 0 ? [{ userId, focusedMs }] : [];
  });
}

export function getHostId(roomId: string): string | null {
  return rooms.get(roomId)?.hostId ?? null;
}

export function setHost(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (room) room.hostId = userId;
}

/** Who has been in the room longest, for handing over the host role. */
export function longestPresentMember(roomId: string): string | null {
  const [first] = sortedMembers(roomId);
  return first?.[0] ?? null;
}

function sortedMembers(roomId: string): [string, Member][] {
  const members = [...(rooms.get(roomId)?.members ?? [])];
  return members.sort(([, a], [, b]) => a.joinedAt.getTime() - b.joinedAt.getTime());
}

/** The People list, longest present first. */
export function listMembers(roomId: string): PresenceMember[] {
  const hostId = getHostId(roomId);
  return sortedMembers(roomId).map(([userId, member]) => ({
    userId,
    name: member.profile.name,
    username: member.profile.username,
    avatarColor: member.profile.avatarColor,
    status: member.status,
    workingOn: member.workingOn,
    isHost: userId === hostId,
    joinedAt: member.joinedAt.toISOString(),
    focusingSince: member.focusingSince?.toISOString() ?? null,
  }));
}

/** People in the room, each counted once however many tabs they have open. */
export function countMembers(roomId: string): number {
  return rooms.get(roomId)?.members.size ?? 0;
}

/** The host changed the room's size. Nobody already here loses their seat; the service checks that first. */
export function setMaxSize(roomId: string, maxSize: number): void {
  const room = rooms.get(roomId);
  if (room) room.maxSize = maxSize;
}

/** Rooms with no space left, so the "Has space" filter can leave them out in the database query. */
export function fullRoomIds(): string[] {
  return [...rooms].flatMap(([roomId, room]) => (room.members.size >= room.maxSize ? [roomId] : []));
}

/** For tests. */
export function resetPresence(): void {
  rooms.clear();
  roomsBySocket.clear();
}
