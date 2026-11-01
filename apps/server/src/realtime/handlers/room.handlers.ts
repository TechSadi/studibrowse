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
  isSocketInRoom,
  listMembers,
  longestPresentMember,
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
}

export interface RoomHandlers {
  register: HandlerRegistrar;
  /** Cancels pending departures, for shutdown and tests. */
  dispose: () => void;
}

/** room:join, room:leave, status:set, and what a dropped connection does to presence. */
export function createRoomHandlers({
  reconnectGraceMs = RECONNECT_GRACE_MS,
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
    const wasHost = getHostId(roomId) === userId;
    if (!removeMember(roomId, userId)) return;
    const nextHost = wasHost ? longestPresentMember(roomId) : null;
    if (nextHost) setHost(roomId, nextHost);
    broadcastPresence(io, roomId);
    if (nextHost) await setRoomHost(roomId, nextHost);
  }

  /** One socket is out of the room. If it was the last one anywhere, the grace period starts. */
  async function afterSocketLeft(roomId: string, now: Date): Promise<void> {
    if (!hasConnectedSockets(roomId)) await markRoomEmpty(roomId, now);
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
        now: new Date(),
      });
      if (outcome === 'full') throw roomFull();
      cancelDeparture(roomId, userId);
      void socket.join(roomChannel(roomId));

      if (wasEmpty) await markRoomOccupied(roomId);
      const snapshot = await getRoomSnapshot(joinable, userId);
      broadcastPresence(io, roomId);
      return { ...snapshot, members: listMembers(roomId), serverNow: Date.now() };
    });

    onEvent(io, socket, 'room:leave', async ({ roomId }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      void socket.leave(roomChannel(roomId));
      // An explicit leave skips the reconnect window, but only once every tab of theirs has left.
      if (removeSocket(roomId, userId, socket.id) === 0) await depart(io, roomId, userId);
      await afterSocketLeft(roomId, new Date());
      return {};
    });

    onEvent(io, socket, 'status:set', ({ roomId, status, workingOn }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      setStatus(roomId, userId, { status, workingOn }, new Date());
      broadcastPresence(io, roomId);
      return {};
    });

    // A disconnect is not a leave: a refresh or a dropped connection gets reconnectGraceMs to come back.
    socket.on('disconnect', () => {
      const { userId } = socket.data;
      const now = new Date();
      for (const roomId of roomsOfSocket(socket.id)) {
        if (removeSocket(roomId, userId, socket.id) === 0) {
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
        afterSocketLeft(roomId, now).catch((err: unknown) =>
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
