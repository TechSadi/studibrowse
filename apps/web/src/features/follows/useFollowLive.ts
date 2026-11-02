import { useEffect, useState } from 'react';
import type { FollowLive, FollowLiveRoom } from '@studibrowse/shared';
import { useSocket, useSocketEvent } from '../../hooks/useSocket';
import { emitWithAck } from '../../lib/socket';

function toMap(live: FollowLive[]): Map<string, FollowLiveRoom> {
  return new Map(live.flatMap(({ userId, room }) => (room ? [[userId, room] as const] : [])));
}

/**
 * The public room each person you follow is in right now, kept live over the socket (never polled). It watches
 * again on every (re)connect and whenever `following` changes, since the server only watches who you followed
 * when it last asked.
 */
export function useFollowLive(following: string[]): ReadonlyMap<string, FollowLiveRoom> {
  const { socket, status } = useSocket();
  const [live, setLive] = useState<ReadonlyMap<string, FollowLiveRoom>>(() => new Map());
  const followingKey = following.join(',');

  useEffect(() => {
    if (!socket || status !== 'connected') return;
    let current = true;
    emitWithAck('follows:watch', {})
      .then((data) => {
        if (current) setLive(toMap(data.live));
      })
      // Best effort: the dots are extra, and the next connect asks again.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [socket, status, followingKey]);

  useSocketEvent('follows:live', ({ userId, room }) => {
    setLive((previous) => {
      const next = new Map(previous);
      if (room) next.set(userId, room);
      else next.delete(userId);
      return next;
    });
  });

  return live;
}
