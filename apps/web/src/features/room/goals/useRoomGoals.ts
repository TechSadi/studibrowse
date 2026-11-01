import { useCallback, useMemo, useRef, useState } from 'react';
import type { RoomGoal } from '@studibrowse/shared';
import { emitWithAck } from '../../../lib/socket';
import { applyPending, type PendingOp, type ShownGoal } from './pendingGoals';

export interface RoomGoals {
  /** The room's goals with your changes showing straight away. */
  goals: ShownGoal[];
  /** Each one throws ApiError with the server's message if it is refused, after rolling the change back. */
  add: (text: string) => Promise<void>;
  toggle: (goalId: string) => Promise<void>;
  remove: (goalId: string) => Promise<void>;
}

/**
 * Optimistic room goals. `serverGoals` is the room's goals from room:join and goal:update. The server sends
 * goal:update before it acks, on the same socket, so once the ack arrives the change is already in
 * `serverGoals` and the pending op can go, whether it worked or not.
 */
export function useRoomGoals(roomId: string, serverGoals: RoomGoal[], myUserId: string): RoomGoals {
  const [ops, setOps] = useState<PendingOp[]>([]);
  const nextTempId = useRef(0);

  const goals = useMemo(() => applyPending(serverGoals, ops), [serverGoals, ops]);

  const run = useCallback(async (op: PendingOp, send: () => Promise<unknown>) => {
    setOps((current) => [...current, op]);
    try {
      await send();
    } finally {
      setOps((current) => current.filter((pending) => pending !== op));
    }
  }, []);

  const add = useCallback(
    (text: string) =>
      run({ kind: 'add', tempId: `pending-${(nextTempId.current += 1)}`, text, addedBy: myUserId }, () =>
        emitWithAck('goal:add', { roomId, text }),
      ),
    [run, roomId, myUserId],
  );

  const toggle = useCallback(
    (goalId: string) => run({ kind: 'toggle', goalId }, () => emitWithAck('goal:toggle', { roomId, goalId })),
    [run, roomId],
  );

  const remove = useCallback(
    (goalId: string) => run({ kind: 'remove', goalId }, () => emitWithAck('goal:remove', { roomId, goalId })),
    [run, roomId],
  );

  return { goals, add, toggle, remove };
}
