import type { StorageService } from '../../lib/storage';
import { addFile, addLink, removeResource } from '../../modules/resources/resources.service';
import { onEvent } from '../handler';
import { getHostId } from '../presence';
import { roomChannel, type HandlerRegistrar } from '../types';
import { requireSocketInRoom } from './room.handlers';

/** resource:add and resource:remove. Members only; removing is for whoever shared it or the host. */
export function createResourceHandlers(storage: StorageService): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'resource:add', async (payload, { userId }) => {
      requireSocketInRoom(payload.roomId, socket);
      const resource =
        payload.type === 'link'
          ? await addLink(payload.roomId, userId, payload)
          : await addFile(storage, payload.roomId, userId, payload);
      io.to(roomChannel(payload.roomId)).emit('resource:new', { resource });
      return { resource };
    });

    onEvent(io, socket, 'resource:remove', async ({ roomId, resourceId }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      // Presence knows the current host, hand-overs included; checked on every call.
      await removeResource(storage, roomId, resourceId, userId, getHostId(roomId) === userId);
      io.to(roomChannel(roomId)).emit('resource:removed', { roomId, resourceId });
      return {};
    });
  };
}
