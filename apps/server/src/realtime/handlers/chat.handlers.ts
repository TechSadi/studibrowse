import { createMessage } from '../../modules/chat/chat.service';
import { onEvent, onSignal } from '../handler';
import { roomChannel, type HandlerRegistrar } from '../types';
import { requireSocketInRoom } from './room.handlers';

/** chat:send and chat:typing. Members only; the rate limits are applied by the handler wrapper. */
export function createChatHandlers(): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'chat:send', async ({ roomId, text }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      const message = await createMessage(roomId, userId, text);
      // The sender gets it too, so their other tabs stay in step.
      io.to(roomChannel(roomId)).emit('chat:new', { message });
      return { message };
    });

    onSignal(io, socket, 'chat:typing', ({ roomId, isTyping }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      socket.to(roomChannel(roomId)).emit('chat:typing', { roomId, userId, isTyping });
    });
  };
}
