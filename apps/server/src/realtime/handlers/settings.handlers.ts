import { updateRoomSettings } from '../../modules/rooms/rooms.service';
import { broadcastFollowLive } from '../followPresence';
import { onEvent } from '../handler';
import { broadcastRoomCard, removeRoomCard } from '../lobby';
import { countMembers, listMembers, setMaxSize } from '../presence';
import { roomChannel, type HandlerRegistrar } from '../types';
import { requireHost } from './room.handlers';

/** room:settings: the host's Room settings dialog. Everyone in the room gets room:update (and goal:update). */
export function createSettingsHandlers(): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'room:settings', async ({ roomId, ...data }, { userId }) => {
      requireHost(roomId, userId, socket, 'Only the host can change the room settings.');
      const { settings, wasPublic, goals, goalsChanged, timer } = await updateRoomSettings(
        roomId,
        userId,
        data,
        countMembers(roomId),
      );
      setMaxSize(roomId, settings.maxSize);
      io.to(roomChannel(roomId)).emit('room:update', { roomId, settings });
      if (goalsChanged) io.to(roomChannel(roomId)).emit('goal:update', { roomId, goals });
      // A phase waiting for the host took the new length. It's paused, so there's nothing to schedule.
      if (timer) io.to(roomChannel(roomId)).emit('timer:state', { roomId, timer, serverNow: Date.now() });
      if (wasPublic && !settings.isPublic) removeRoomCard(io, roomId);
      else broadcastRoomCard(io, roomId);
      // Going private (or public), or a new name, changes what everyone in it shows their followers.
      broadcastFollowLive(
        io,
        listMembers(roomId).map((member) => member.userId),
      );
      return {};
    });
  };
}
