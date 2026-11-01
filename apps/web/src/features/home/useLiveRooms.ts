import { useInfiniteQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { LobbyRoomCard, RoomSummary } from '@studibrowse/shared';
import { useSocket, useSocketEvent } from '../../hooks/useSocket';
import { roomsApi } from '../../lib/api';
import { emitWithAck, getSocketSnapshot, type AppSocket } from '../../lib/socket';
import { useAuth } from '../auth/AuthContext';
import { removeRoom, upsertRoom, type PublicRoomsData, type RoomFilters } from './roomList';

/** Every cached public room list, whatever its filters. */
export const PUBLIC_ROOMS_KEY = ['rooms', 'public'] as const;
export const publicRoomsKey = (filters: RoomFilters) => [...PUBLIC_ROOMS_KEY, filters] as const;

interface LobbyHold {
  holders: number;
  stop: () => void;
}

// One lobby subscription per socket, shared by every mounted list (Rooms worth joining and Happening now), so
// one of them unmounting doesn't unsubscribe the other.
const holds = new Map<AppSocket, LobbyHold>();

/** Best effort: a failed subscribe is retried on the next connect, and a list still works without it. */
function emitQuietly(event: 'lobby:subscribe' | 'lobby:unsubscribe') {
  emitWithAck(event, {}).catch(() => undefined);
}

function startHold(socket: AppSocket, queryClient: QueryClient): LobbyHold {
  // Anything but the very first connection means the socket was down for a while.
  let missedSome = socket.connected || getSocketSnapshot().status !== 'connecting';
  const onConnect = () => {
    // A reconnected socket is a new one on the server, outside the lobby until it subscribes again.
    emitQuietly('lobby:subscribe');
    // Cards sent while it was down never arrived: load the lists again, once.
    if (missedSome) void queryClient.invalidateQueries({ queryKey: PUBLIC_ROOMS_KEY });
    missedSome = true;
  };
  socket.on('connect', onConnect);
  if (socket.connected) emitQuietly('lobby:subscribe');
  return {
    holders: 0,
    stop: () => {
      socket.off('connect', onConnect);
      if (socket.connected) emitQuietly('lobby:unsubscribe');
    },
  };
}

/** Keeps `socket` in the lobby until every holder has let go. Returns the function that lets go. */
export function holdLobby(socket: AppSocket, queryClient: QueryClient): () => void {
  const hold = holds.get(socket) ?? startHold(socket, queryClient);
  holds.set(socket, hold);
  hold.holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hold.holders -= 1;
    if (hold.holders > 0) return;
    holds.delete(socket);
    hold.stop();
  };
}

/**
 * The public room list for `filters`, kept live: while mounted it listens to the lobby and merges each pushed
 * card into this list's cache, in the server's order (people you follow first). Other cached filters are only
 * marked stale, so they load fresh when shown again.
 */
export function useLiveRooms(filters: RoomFilters) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const { state } = useAuth();
  const queryKey = publicRoomsKey(filters);

  const rooms = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => roomsApi.listPublic({ page: pageParam, ...filters }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });

  useEffect(() => (socket ? holdLobby(socket, queryClient) : undefined), [socket, queryClient]);

  function update(change: (data: PublicRoomsData) => PublicRoomsData) {
    queryClient.setQueryData<PublicRoomsData>(queryKey, (data) => data && change(data));
    void queryClient.invalidateQueries({ queryKey: PUBLIC_ROOMS_KEY, type: 'inactive' });
  }

  useSocketEvent('rooms:upsert', ({ room }: { room: LobbyRoomCard }) => {
    const summary: RoomSummary = {
      ...room,
      hostFollowed: state.user?.following.includes(room.host.id) ?? false,
    };
    update((data) => upsertRoom(data, summary, filters));
  });

  useSocketEvent('rooms:remove', ({ roomId }) => update((data) => removeRoom(data, roomId)));

  return rooms;
}
