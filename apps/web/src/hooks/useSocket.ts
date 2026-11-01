import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ServerToClientEvents } from '@studibrowse/shared';
import { getSocketSnapshot, subscribeToSocket, type SocketSnapshot } from '../lib/socket';

/** The signed-in user's socket (null while signed out) and its connection status. */
export function useSocket(): SocketSnapshot {
  return useSyncExternalStore(subscribeToSocket, getSocketSnapshot);
}

/**
 * Listens to a server event for as long as the component is mounted. The latest `handler` is always called,
 * so it doesn't need to be memoised.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
): void {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: Parameters<ServerToClientEvents[E]>[0]) =>
      (handlerRef.current as (payload: Parameters<ServerToClientEvents[E]>[0]) => void)(payload);
    // Socket.IO's listener types don't narrow on a generic event name.
    socket.on(event, listener as never);
    return () => {
      socket.off(event, listener as never);
    };
  }, [socket, event]);
}
