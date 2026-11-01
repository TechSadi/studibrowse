import { listMembers } from './presence';
import { roomChannel, type TypedServer } from './types';

/** Sends the room its People list after any presence change. */
export function broadcastPresence(io: TypedServer, roomId: string): void {
  io.to(roomChannel(roomId)).emit('presence:update', { roomId, members: listMembers(roomId) });
}
