import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSocket, useSocketEvent } from '../../hooks/useSocket';
import { ApiError } from '../../lib/api';
import { emitWithAck } from '../../lib/socket';
import { initialRoomSession, isEnded, roomSessionReducer, type RoomSessionState } from './roomSession';

export interface RoomSession {
  state: RoomSessionState;
  /** Try joining again after an error. */
  retry: () => void;
  /**
   * Leave with the Leave button: the room moves to `left` at once, and the promise settles once the server has
   * saved your focus time (or the leave failed), so the session summary can load after it.
   */
  leave: () => Promise<void>;
  /** Join again after leaving, as a new visit. */
  rejoin: () => void;
}

/**
 * Being in a room: joins when the socket connects and joins again after every reconnect (Socket.IO doesn't
 * rejoin rooms by itself; inside the server's reconnect window you keep your place). Follows presence, room
 * settings, goals, shared files and removal. Unmounting leaves the room, unless you already left or the room
 * had ended for you.
 */
export function useRoomSession(roomId: string, inviteCode: string | undefined): RoomSession {
  const { socket } = useSocket();
  const [state, dispatch] = useReducer(roomSessionReducer, initialRoomSession);
  const [attempt, setAttempt] = useState(0);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!socket) return;
    let active = true;
    let joinedOnce = false;

    function join() {
      if (isEnded(stateRef.current)) return;
      dispatch({ type: 'join' });
      emitWithAck('room:join', inviteCode ? { roomId, inviteCode } : { roomId }).then(
        (data) => {
          if (!active) return;
          joinedOnce = true;
          dispatch({ type: 'joined', data });
        },
        (err: unknown) => {
          if (!active) return;
          const { code, message } =
            err instanceof ApiError ? err : { code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
          dispatch({ type: 'joinFailed', code, message });
        },
      );
    }
    const onDisconnect = () => dispatch({ type: 'disconnected' });

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    return () => {
      active = false;
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      // Navigating away is leaving. A refresh or a closed tab is a disconnect instead, with its grace period.
      if (joinedOnce && !isEnded(stateRef.current)) {
        emitWithAck('room:leave', { roomId }).catch(() => undefined);
      }
    };
  }, [socket, roomId, inviteCode, attempt]);

  useSocketEvent('presence:update', (payload) => {
    if (payload.roomId === roomId) dispatch({ type: 'presence', members: payload.members });
  });
  useSocketEvent('room:update', (payload) => {
    if (payload.roomId === roomId) dispatch({ type: 'settings', settings: payload.settings });
  });
  useSocketEvent('goal:update', (payload) => {
    if (payload.roomId === roomId) dispatch({ type: 'goals', goals: payload.goals });
  });
  useSocketEvent('resource:new', ({ resource }) => {
    if (resource.roomId === roomId) dispatch({ type: 'resourceAdded', resource });
  });
  useSocketEvent('resource:removed', (payload) => {
    if (payload.roomId === roomId) dispatch({ type: 'resourceRemoved', resourceId: payload.resourceId });
  });
  useSocketEvent('room:removed', (payload) => {
    if (payload.roomId === roomId) dispatch({ type: 'removed' });
  });

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const leave = useCallback(async () => {
    const { status } = stateRef.current;
    if (status !== 'joined' && status !== 'rejoining') return;
    // `left` counts as ended, so unmounting won't send room:leave a second time.
    dispatch({ type: 'left' });
    await emitWithAck('room:leave', { roomId }).catch(() => undefined);
  }, [roomId]);

  const rejoin = useCallback(() => {
    dispatch({ type: 'rejoin' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry, leave, rejoin };
}
