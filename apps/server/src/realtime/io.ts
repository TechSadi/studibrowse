import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

/** Attaches Socket.IO to the HTTP server. Auth middleware and handlers arrive in Phase 2. */
export function createIo(httpServer: HttpServer, clientOrigin: string): Server {
  return new Server(httpServer, {
    cors: { origin: clientOrigin },
  });
}
