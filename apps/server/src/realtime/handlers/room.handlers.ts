import { RECONNECT_GRACE_MS, type MemberStatus } from '@studibrowse/shared';
import { logger } from '../../lib/logger';
import { notAMember, notHost, roomFull } from '../../modules/rooms/rooms.errors';
import {
  getRoomSnapshot,
  loadJoinableRoom,
  loadMemberProfile,
  markRoomEmpty,
  markRoomOccupied,
  setRoomHost,
} from '../../modules/rooms/rooms.service';
import { broadcastPresence } from '../broadcast';
import { onEvent } from '../handler';
import {
  addSocket,
  getHostId,
  hasConnectedSockets,
  isMember,
  isSocketInRoom,
  listMembers,
  longestPresentMember,
  memberSocketCount,
  removeMember,
  removeSocket,
  roomsOfSocket,
  setHost,
  setStatus,
} from '../presence';
import { roomChannel, type HandlerRegistrar, type TypedServer, type TypedSocket } from '../types';

export interface RoomHandlerOptions {
  /** How long someone whose last tab dropped keeps their place. Tests shorten it. */
  reconnectGraceMs?: number;
  /**
   * Runs when someone leaves for good, before they are taken out of presence, so their focus time can be
   * saved (the room timer's memberLeaving). A failure is logged and doesn't stop them leaving.
   */
  onDepart?: (roomId: string, userId: string, at: Date) => Promise<void>;
  /** The clock. Tests share one with the room timer. */
  now?: () => Date;
}

export interface RoomHandlers {
  register: HandlerRegistrar;
  /** Cancels pending departures, for shutdown and tests. */
  dispose: () => void;
}

/** room:join, room:leave, status:set, and what a dropped connection does to presence. */
export function createRoomHandlers({
  reconnectGraceMs = RECONNECT_GRACE_MS,
  onDepart,
  now = () => new Date(),
}: RoomHandlerOptions = {}): RoomHandlers {
  const pendingDepartures = new Map<string, NodeJS.Timeout>();
  const departureKey = (roomId: string, userId: string) => `${roomId}:${userId}`;

  function cancelDeparture(roomId: string, userId: string): void {
    const key = departureKey(roomId, userId);
    clearTimeout(pendingDepartures.get(key));
    pendingDepartures.delete(key);
  }

  /** Someone left for good: by room:leave, or when the reconnect window ran out. */
  async function depart(io: TypedServer, roomId: string, userId: string): Promise<void> {
    cancelDeparture(roomId, userId);
    if (!isMember(roomId, userId)) return;
    await onDepart?.(roomId, userId, now()).catch((err: unknown) =>
      logger.error({ err, roomId, userId }, 'failed to save focus time for someone leaving'),
    );
    // They may have come back in another tab while their focus time was saved; then they stay.
    if (memberSocketCount(roomId, userId) > 0) return;
    const wasHost = getHostId(roomId) === userId;
    if (!removeMember(roomId, userId)) return;
    const nextHost = wasHost ? longestPresentMember(roomId) : null;
    if (nextHost) setHost(roomId, nextHost);
    broadcastPresence(io, roomId);
    if (nextHost) await setRoomHost(roomId, nextHost);
  }

  /** One socket is out of the room. If it was the last one anywhere, the grace period starts. */
  async function afterSocketLeft(roomId: string, at: Date): Promise<void> {
    if (!hasConnectedSockets(roomId)) await markRoomEmpty(roomId, at);
  }

  const register: HandlerRegistrar = (io, socket) => {
    onEvent(io, socket, 'room:join', async ({ roomId, inviteCode }, { userId }) => {
      const joinable = await loadJoinableRoom(userId, roomId, inviteCode);
      const profile = await loadMemberProfile(userId);

      // No await from here to addSocket, so two people racing for the last seat can't both get it.
      const wasEmpty = !hasConnectedSockets(roomId);
      const { room } = joinable;
      const outcome = addSocket(roomId, socket.id, {
        userId,
        profile,
        status: statusForPhase(room.timer.phase),
        maxSize: room.maxSize,
        hostId: room.hostId.toString(),
        focusRunning: room.timer.phase === 'focus' && room.timer.endsAt !== null,
        now: now(),
      });
      if (outcome === 'full') throw roomFull();
      cancelDeparture(roomId, userId);
      void socket.join(roomChannel(roomId));

      if (wasEmpty) await markRoomOccupied(roomId);
      const snapshot = await getRoomSnapshot(joinable, userId);
      broadcastPresence(io, roomId);
      return { ...snapshot, members: listMembers(roomId), serverNow: now().getTime() };
    });

    onEvent(io, socket, 'room:leave', async ({ roomId }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      void socket.leave(roomChannel(roomId));
      // An explicit leave skips the reconnect window, but only once every tab of theirs has left.
      if (removeSocket(roomId, userId, socket.id, now()) === 0) await depart(io, roomId, userId);
      await afterSocketLeft(roomId, now());
      return {};
    });

    onEvent(io, socket, 'status:set', ({ roomId, status, workingOn }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      setStatus(roomId, userId, { status, workingOn }, now());
      broadcastPresence(io, roomId);
      return {};
    });

    // A disconnect is not a leave: a refresh or a dropped connection gets reconnectGraceMs to come back.
    socket.on('disconnect', () => {
      const { userId } = socket.data;
      const at = now();
      for (const roomId of roomsOfSocket(socket.id)) {
        if (removeSocket(roomId, userId, socket.id, at) === 0) {
          cancelDeparture(roomId, userId);
          const timer = setTimeout(() => {
            pendingDepartures.delete(departureKey(roomId, userId));
            depart(io, roomId, userId).catch((err: unknown) =>
              logger.error({ err, roomId, userId }, 'failed to remove a member after the reconnect window'),
            );
          }, reconnectGraceMs);
          timer.unref();
          pendingDepartures.set(departureKey(roomId, userId), timer);
        }
        afterSocketLeft(roomId, at).catch((err: unknown) =>
          logger.error({ err, roomId }, 'failed to mark a room empty'),
        );
      }
    });
  };

  function dispose(): void {
    for (const timer of pendingDepartures.values()) clearTimeout(timer);
    pendingDepartures.clear();
  }

  return { register, dispose };
}

export function requireSocketInRoom(roomId: string, socket: TypedSocket): void {
  if (!isSocketInRoom(roomId, socket.id)) throw notAMember();
}

/** This socket joined the room and its user is the room's current host. Checked on every host command. */
export function requireHost(roomId: string, userId: string, socket: TypedSocket, message?: string): void {
  requireSocketInRoom(roomId, socket);
  if (getHostId(roomId) !== userId) throw notHost(message);
}

/** Where a newcomer's status starts. The timer moves it on from there. */
function statusForPhase(phase: string): MemberStatus {
  return phase === 'focus' ? 'focusing' : 'break';
}
