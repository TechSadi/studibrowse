import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { SOCKET_ERROR_CODES } from '@studibrowse/shared';
import { socketAuth, type ConnectError } from './socketAuth';
import { MAX_SOCKET_PAYLOAD_BYTES, MAX_SOCKETS_PER_USER } from './socketRateLimit';
import { userRoom, type HandlerRegistrar, type TypedServer, type TypedSocket } from './types';

export interface IoOptions {
  clientOrigin: string;
  /** Each feature's handlers, added to every socket once it is authenticated. Tests pass their own. */
  registerHandlers?: HandlerRegistrar[];
  /** Tests lower it. */
  maxSocketsPerUser?: number;
}

function tooManySockets(): ConnectError {
  const data = {
    code: SOCKET_ERROR_CODES.rateLimited,
    message: 'You have too many StudiBrowse tabs open. Close a few and reload.',
  };
  return Object.assign(new Error(data.message), { data });
}

/**
 * Attaches Socket.IO to the HTTP server. Only sockets with a valid access token get through. In production the
 * browser connects here directly (not through Vercel), so the token in the handshake is the only credential.
 */
export function createIo(
  httpServer: HttpServer,
  { clientOrigin, registerHandlers = [], maxSocketsPerUser = MAX_SOCKETS_PER_USER }: IoOptions,
): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: { origin: clientOrigin },
    // The default is 1 MB; no valid event comes close to this.
    maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
  });

  io.use(socketAuth);
  // After socketAuth, so userId is set. In-memory adapter: the room's size is the user's open sockets.
  io.use((socket: TypedSocket, next) => {
    const open = io.sockets.adapter.rooms.get(userRoom(socket.data.userId))?.size ?? 0;
    next(open >= maxSocketsPerUser ? tooManySockets() : undefined);
  });

  io.on('connection', (socket) => {
    // In-memory adapter: join() is synchronous.
    void socket.join(userRoom(socket.data.userId));
    for (const register of registerHandlers) register(io, socket);
  });

  return io;
}
