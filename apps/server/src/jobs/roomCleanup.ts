import { ROOM_GRACE_MS } from '@studibrowse/shared';
import { logger } from '../lib/logger';
import { Message } from '../modules/chat/message.model';
import { Resource } from '../modules/resources/resource.model';
import { Room } from '../modules/rooms/room.model';
import { countMembers } from '../realtime/presence';

export const ROOM_CLEANUP_INTERVAL_MS = 30 * 1000;

/**
 * Closes rooms that have been empty for longer than the grace period: sets closedAt, empties the goals and
 * deletes the chat and resources. The room document stays so invite links can show Room closed; session
 * logs are never touched. Returns the ids it closed.
 */
export async function closeEmptyRooms(now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ROOM_GRACE_MS);
  const candidates = await Room.find({ closedAt: null, emptySince: { $lte: cutoff } }, { _id: 1 }).lean();
  // Someone inside their reconnect window still counts as in the room. This also covers an emptySince
  // write that landed after a rejoin.
  const ids = candidates.map((room) => room._id).filter((id) => countMembers(id.toString()) === 0);
  if (ids.length === 0) return [];

  // Repeating the emptySince condition means a join that cleared it in the meantime wins.
  await Room.updateMany(
    { _id: { $in: ids }, closedAt: null, emptySince: { $lte: cutoff } },
    { closedAt: now, goals: [] },
  );
  const closed = await Room.find({ _id: { $in: ids }, closedAt: now }, { _id: 1 }).lean();
  const closedIds = closed.map((room) => room._id);
  await Promise.all([
    Message.deleteMany({ roomId: { $in: closedIds } }),
    Resource.deleteMany({ roomId: { $in: closedIds } }),
  ]);
  return closedIds.map((id) => id.toString());
}

/**
 * Presence lives in memory, so after a restart nobody is in any room. Open rooms that think they're occupied
 * start their grace period now, or they would never close.
 */
export async function markUnoccupiedRoomsEmpty(now = new Date()): Promise<void> {
  const open = await Room.find({ closedAt: null, emptySince: null }, { _id: 1 }).lean();
  const unoccupied = open.map((room) => room._id).filter((id) => countMembers(id.toString()) === 0);
  if (unoccupied.length > 0) await Room.updateMany({ _id: { $in: unoccupied } }, { emptySince: now });
}

/** Runs closeEmptyRooms every `intervalMs`. Returns a function that stops it. */
export function startRoomCleanup({ intervalMs = ROOM_CLEANUP_INTERVAL_MS } = {}): () => void {
  const run = () =>
    closeEmptyRooms().catch((err: unknown) => logger.error({ err }, '[rooms] cleanup failed'));
  markUnoccupiedRoomsEmpty().catch((err: unknown) =>
    logger.error({ err }, '[rooms] failed to mark unoccupied rooms empty'),
  );
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
