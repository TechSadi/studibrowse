import { listFollowing } from '../../modules/users/users.service';
import { liveStateOf } from '../followPresence';
import { onEvent } from '../handler';
import { WATCH_CHANNEL_PREFIX, watchChannel, type HandlerRegistrar } from '../types';

/**
 * follows:watch: the sidebar's live dots. The socket watches exactly the people its user follows now, read from
 * the database rather than the client, and gets a snapshot of where each of them is.
 */
export function createFollowHandlers(): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'follows:watch', async (_payload, { userId }) => {
      const followed = (await listFollowing(userId)).map((user) => user.id);
      // In-memory adapter: join() and leave() are synchronous.
      for (const channel of socket.rooms) {
        if (channel.startsWith(WATCH_CHANNEL_PREFIX)) void socket.leave(channel);
      }
      for (const id of followed) void socket.join(watchChannel(id));
      return { live: await liveStateOf(followed) };
    });
  };
}
