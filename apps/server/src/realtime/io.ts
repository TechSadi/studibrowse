import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { socketAuth } from './socketAuth';
import { eventRateLimiters } from './socketRateLimit';
import { userRoom, type HandlerRegistrar, type TypedServer } from './types';

export interface IoOptions {
  clientOrigin: string;
  /** Each feature's handlers, added to every socket once it is authenticated. Tests pass their own. */
  registerHandlers?: HandlerRegistrar[];
}

/** Attaches Socket.IO to the HTTP server. Only sockets with a valid access token get through. */
export function createIo(
  httpServer: HttpServer,
  { clientOrigin, registerHandlers = [] }: IoOptions,
): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: { origin: clientOrigin },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    // In-memory adapter: join() is synchronous.
    void socket.join(userRoom(socket.data.userId));
    for (const register of registerHandlers) register(io, socket);
    socket.on('disconnect', () => {
      for (const limiter of Object.values(eventRateLimiters)) limiter.forget(socket.id);
    });
  });

  return io;
}
