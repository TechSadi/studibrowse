import type { FollowLive } from '@studibrowse/shared';
import { createKeyedLock } from '../lib/keyedLock';
import { logger } from '../lib/logger';
import { findOpenPublicRooms } from '../modules/rooms/rooms.service';
import { getHostId, roomsOfUser } from './presence';
import { watchChannel, type TypedServer } from './types';

/**
 * Live dots for followers: whether someone is in a public room right now. Private rooms are never mentioned,
 * so following someone doesn't reveal them. See docs/SOCKET-EVENTS.md › Following.
 */

/** Which public room each person is in now (the first one found, if they're in several). */
export async function liveStateOf(userIds: string[]): Promise<FollowLive[]> {
  const roomIdsByUser = new Map(userIds.map((userId) => [userId, roomsOfUser(userId)]));
  const allRoomIds = [...new Set([...roomIdsByUser.values()].flat())];
  const publicRooms = new Map((await findOpenPublicRooms(allRoomIds)).map((room) => [room.id, room]));
  return userIds.map((userId) => {
    const room = (roomIdsByUser.get(userId) ?? []).map((id) => publicRooms.get(id)).find(Boolean);
    return {
      userId,
      room: room ? { id: room.id, name: room.name, isHost: getHostId(room.id) === userId } : null,
    };
  });
}

// One send at a time per person, so a quick join then leave can't arrive in the wrong order.
const sendInOrder = createKeyedLock();

/** Tells everyone watching these people where each of them is now. Fire and forget. */
export function broadcastFollowLive(io: TypedServer, userIds: string[]): void {
  for (const userId of userIds) {
    sendInOrder(userId, async () => {
      const [live] = await liveStateOf([userId]);
      if (live) io.to(watchChannel(userId)).emit('follows:live', live);
    }).catch((err: unknown) => logger.error({ err, userId }, 'failed to tell followers where someone is'));
  }
}
