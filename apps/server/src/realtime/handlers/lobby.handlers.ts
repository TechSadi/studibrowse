import { onEvent } from '../handler';
import { LOBBY_CHANNEL, type HandlerRegistrar } from '../types';

/** lobby:subscribe and lobby:unsubscribe: any signed-in socket can watch the public room list. */
export function createLobbyHandlers(): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'lobby:subscribe', () => {
      // In-memory adapter: join() and leave() are synchronous.
      void socket.join(LOBBY_CHANNEL);
      return {};
    });

    onEvent(io, socket, 'lobby:unsubscribe', () => {
      void socket.leave(LOBBY_CHANNEL);
      return {};
    });
  };
}
