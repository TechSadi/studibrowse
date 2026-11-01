import { ROOM_GRACE_MS } from '@studibrowse/shared';
import { logger } from '../lib/logger';
import type { StorageService } from '../lib/storage';
import { Message } from '../modules/chat/message.model';
import { Resource } from '../modules/resources/resource.model';
import { Room } from '../modules/rooms/room.model';
import { countMembers } from '../realtime/presence';

export const ROOM_CLEANUP_INTERVAL_MS = 30 * 1000;

/** Logs a room's unfinished run as it closes (the room timer's finalizeOnClose). */
export type FinalizeRun = (roomId: string, endedAt: Date) => Promise<void>;

/**
 * Closes rooms that have been empty for longer than the grace period: logs a run that was still going, sets
 * closedAt, empties the goals and deletes the chat, the resources and the room's stored files. The room
 * document stays so invite links can show Room closed; session logs are never touched. Returns the ids it
 * closed.
 */
export async function closeEmptyRooms(
  storage: StorageService,
  now = new Date(),
  finalizeRun?: FinalizeRun,
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ROOM_GRACE_MS);
  const candidates = await Room.find(
    { closedAt: null, emptySince: { $lte: cutoff } },
    { _id: 1, emptySince: 1 },
  ).lean();
  // Someone inside their reconnect window still counts as in the room. This also covers an emptySince
  // write that landed after a rejoin.
  const empty = candidates.filter((room) => countMembers(room._id.toString()) === 0);
  const ids = empty.map((room) => room._id);
  if (ids.length === 0) return [];

  // Before closing, while the goals are still there to count. The run ends when the last person left.
  if (finalizeRun) await finalizeRuns(finalizeRun, empty);

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
    deleteStoredFiles(
      storage,
      closedIds.map((id) => id.toString()),
    ),
  ]);
  return closedIds.map((id) => id.toString());
}

async function finalizeRuns(
  finalizeRun: FinalizeRun,
  rooms: { _id: { toString(): string }; emptySince?: Date | null }[],
): Promise<void> {
  const results = await Promise.allSettled(
    rooms.map((room) => finalizeRun(room._id.toString(), room.emptySince ?? new Date())),
  );
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason, roomId: rooms[i]?._id.toString() }, '[rooms] failed to log a run');
    }
  });
}

/**
 * Deletes each room's folder, uploads that were never shared included. A failure is logged and doesn't stop
 * the rest of the cleanup; the room is closed either way.
 */
async function deleteStoredFiles(storage: StorageService, roomIds: string[]): Promise<void> {
  const results = await Promise.allSettled(roomIds.map((roomId) => storage.deleteRoomFiles(roomId)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason, roomId: roomIds[i] }, '[rooms] failed to delete stored files');
    }
  });
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
export function startRoomCleanup({
  storage,
  finalizeRun,
  onClosed,
  intervalMs = ROOM_CLEANUP_INTERVAL_MS,
}: {
  storage: StorageService;
  finalizeRun?: FinalizeRun;
  /** Called with the ids each run closed, so the lobby can take their cards down. */
  onClosed?: (roomIds: string[]) => void;
  intervalMs?: number;
}): () => void {
  const run = () =>
    closeEmptyRooms(storage, new Date(), finalizeRun)
      .then((closed) => {
        if (closed.length > 0) onClosed?.(closed);
      })
      .catch((err: unknown) => logger.error({ err }, '[rooms] cleanup failed'));
  markUnoccupiedRoomsEmpty().catch((err: unknown) =>
    logger.error({ err }, '[rooms] failed to mark unoccupied rooms empty'),
  );
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
