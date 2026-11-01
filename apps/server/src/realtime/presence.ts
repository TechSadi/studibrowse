import type { AvatarColor, MemberStatus, PresenceMember, TimerPhase } from '@studibrowse/shared';
import type { FocusCredit } from '../modules/rooms/roomTimer.service';

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
  /** Set while their focus time is counting: see `shouldAccrue`. */
  accruingSince: Date | null;
  /** Focus time counted but not yet drained into the room's run. */
  bankedMs: number;
}

interface RoomPresence {
  maxSize: number;
  hostId: string;
  /** Whether the timer is running a focus phase (not paused, not a break). Set by the room timer. */
  focusRunning: boolean;
  members: Map<string, Member>;
}

/**
 * Focus time counts only while the timer runs a focus phase, the person is Focusing and at least one of their
 * tabs is connected. Every change to one of those first banks the time so far, then starts counting again if
 * it still applies, so credits are exact and paused time never counts.
 */
function shouldAccrue(room: RoomPresence, member: Member): boolean {
  return room.focusRunning && member.status === 'focusing' && member.sockets.size > 0;
}

function bank(member: Member, at: Date): void {
  if (member.accruingSince) {
    member.bankedMs += Math.max(0, at.getTime() - member.accruingSince.getTime());
  }
  member.accruingSince = null;
}

function resumeIfDue(room: RoomPresence, member: Member, at: Date): void {
  if (!member.accruingSince && shouldAccrue(room, member)) member.accruingSince = at;
}

/** Banks under the old conditions, applies `change`, then counts again under the new ones. */
function recount(room: RoomPresence, member: Member, at: Date, change: () => void): void {
  bank(member, at);
  change();
  resumeIfDue(room, member, at);
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
  /** Whether the room's timer is running a focus phase, taken when this join brings the room into memory. */
  focusRunning?: boolean;
  now: Date;
}

/**
 * Adds a socket to a room. 'full' when the room already holds `maxSize` people and this user isn't one of
 * them; seats are counted by person, so another tab of someone already here always gets in.
 */
export function addSocket(
  roomId: string,
  socketId: string,
  { userId, profile, status, maxSize, hostId, focusRunning = false, now }: NewSocket,
): 'joined' | 'rejoined' | 'full' {
  const room = rooms.get(roomId) ?? {
    maxSize,
    hostId,
    focusRunning,
    members: new Map<string, Member>(),
  };
  room.maxSize = maxSize;
  const existing = room.members.get(userId);
  if (!existing && room.members.size >= maxSize) return 'full';

  if (existing) {
    existing.profile = profile;
    // Back from a dropped connection: their focus time counts again from now.
    recount(room, existing, now, () => existing.sockets.add(socketId));
  } else {
    // An empty room takes the host and timer from the database; while people are here, the store's win.
    if (room.members.size === 0) {
      room.hostId = hostId;
      room.focusRunning = focusRunning;
    }
    const member: Member = {
      profile,
      sockets: new Set([socketId]),
      joinedAt: now,
      status,
      workingOn: '',
      focusingSince: status === 'focusing' ? now : null,
      accruingSince: null,
      bankedMs: 0,
    };
    resumeIfDue(room, member, now);
    room.members.set(userId, member);
  }
  rooms.set(roomId, room);
  const socketRooms = roomsBySocket.get(socketId) ?? new Set<string>();
  socketRooms.add(roomId);
  roomsBySocket.set(socketId, socketRooms);
  return existing ? 'rejoined' : 'joined';
}

/**
 * Takes one socket out of a room. Returns how many sockets that user still has there. When it was their last,
 * their focus time stops counting at `now`; what was counted stays banked for the next drain.
 */
export function removeSocket(roomId: string, userId: string, socketId: string, now = new Date()): number {
  const socketRooms = roomsBySocket.get(socketId);
  socketRooms?.delete(roomId);
  if (socketRooms?.size === 0) roomsBySocket.delete(socketId);

  const room = rooms.get(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) return 0;
  recount(room, member, now, () => member.sockets.delete(socketId));
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

/** How many tabs someone has connected in a room (0 inside their reconnect window, or if they aren't there). */
export function memberSocketCount(roomId: string, userId: string): number {
  return rooms.get(roomId)?.members.get(userId)?.sockets.size ?? 0;
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
  const room = rooms.get(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) return;
  if (workingOn !== undefined) member.workingOn = workingOn;
  if (status !== undefined && status !== member.status) {
    recount(room, member, now, () => {
      member.status = status;
      member.focusingSince = status === 'focusing' ? now : null;
    });
  }
}

/**
 * The timer moved to `phase` at `at`: everyone follows it (focus → Focusing, anything else → Break), except
 * people who set themselves Away. Returns whether anyone's status changed.
 */
export function applyPhaseStatus(roomId: string, phase: TimerPhase, at: Date): boolean {
  const status: MemberStatus = phase === 'focus' ? 'focusing' : 'break';
  const room = rooms.get(roomId);
  if (!room) return false;
  let changed = false;
  for (const member of room.members.values()) {
    if (member.status === 'away' || member.status === status) continue;
    recount(room, member, at, () => {
      member.status = status;
      member.focusingSince = status === 'focusing' ? at : null;
    });
    changed = true;
  }
  return changed;
}

/**
 * The timer started or stopped running a focus phase at `at` (start, resume, pause, skip, reset or a phase
 * ending). Banks everyone's focus time up to `at` under the old state, then counts under the new one.
 */
export function setFocusRunning(roomId: string, running: boolean, at: Date): void {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const member of room.members.values()) bank(member, at);
  room.focusRunning = running;
  for (const member of room.members.values()) resumeIfDue(room, member, at);
}

/**
 * Hands over the focus time counted up to `at`, for one member or everyone, and restarts their count from
 * there, so nothing is credited twice. People with nothing counted are left out.
 */
export function drainFocus(roomId: string, at: Date, userId?: string): FocusCredit[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  const members = userId ? [...room.members].filter(([id]) => id === userId) : [...room.members];
  return members.flatMap(([id, member]) => {
    recount(room, member, at, () => undefined);
    const focusedMs = member.bankedMs;
    member.bankedMs = 0;
    return focusedMs > 0 ? [{ userId: id, focusedMs }] : [];
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

/** The first `limit` people in the room, longest present first, for the invite preview's avatar stack. */
export function memberPreview(roomId: string, limit: number): Pick<MemberProfile, 'name' | 'avatarColor'>[] {
  return sortedMembers(roomId)
    .slice(0, limit)
    .map(([, member]) => ({ name: member.profile.name, avatarColor: member.profile.avatarColor }));
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
