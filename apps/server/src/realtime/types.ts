import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@studibrowse/shared';

type NoInterServerEvents = Record<string, never>;

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, NoInterServerEvents, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, NoInterServerEvents, SocketData>;

/** Adds a feature's event handlers to a newly connected socket. */
export type HandlerRegistrar = (io: TypedServer, socket: TypedSocket) => void;

/** Each user's private Socket.IO room, for notifications to all of their tabs. */
export const userRoom = (userId: string) => `user:${userId}`;

/** The Socket.IO room for a study room's members. */
export const roomChannel = (roomId: string) => `room:${roomId}`;

/** The Socket.IO room for everyone looking at a list of public rooms (Home). */
export const LOBBY_CHANNEL = 'lobby';
