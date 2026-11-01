import { updateRoomSettings } from '../../modules/rooms/rooms.service';
import { onEvent } from '../handler';
import { broadcastRoomCard, removeRoomCard } from '../lobby';
import { countMembers, setMaxSize } from '../presence';
import { roomChannel, type HandlerRegistrar } from '../types';
import { requireHost } from './room.handlers';

/** room:settings: the host's Room settings dialog. Everyone in the room gets room:update (and goal:update). */
export function createSettingsHandlers(): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'room:settings', async ({ roomId, ...data }, { userId }) => {
      requireHost(roomId, userId, socket, 'Only the host can change the room settings.');
      const { settings, wasPublic, goals, goalsChanged } = await updateRoomSettings(
        roomId,
        userId,
        data,
        countMembers(roomId),
      );
      setMaxSize(roomId, settings.maxSize);
      io.to(roomChannel(roomId)).emit('room:update', { roomId, settings });
      if (goalsChanged) io.to(roomChannel(roomId)).emit('goal:update', { roomId, goals });
      if (wasPublic && !settings.isPublic) removeRoomCard(io, roomId);
      else broadcastRoomCard(io, roomId);
      return {};
    });
  };
}
