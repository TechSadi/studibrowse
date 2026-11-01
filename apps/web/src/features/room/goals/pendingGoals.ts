import type { RoomGoal } from '@studibrowse/shared';

/** A goal as the Goals tab shows it. `pending`: added here, not yet confirmed by the server. */
export interface ShownGoal extends RoomGoal {
  pending?: boolean;
}

/** A goal change sent to the server and not yet acknowledged. */
export type PendingOp =
  | { kind: 'add'; tempId: string; text: string; addedBy: string }
  | { kind: 'toggle'; goalId: string }
  | { kind: 'remove'; goalId: string };

function apply(goals: ShownGoal[], op: PendingOp): ShownGoal[] {
  switch (op.kind) {
    case 'add':
      return [...goals, { id: op.tempId, text: op.text, done: false, addedBy: op.addedBy, pending: true }];
    case 'toggle':
      return goals.map((goal) => (goal.id === op.goalId ? { ...goal, done: !goal.done } : goal));
    case 'remove':
      return goals.filter((goal) => goal.id !== op.goalId);
  }
}

/**
 * The server's goals with your unacknowledged changes on top, in the order you made them. Laying them over the
 * latest goal:update (instead of editing a copy) means changes from other people are never lost, and dropping
 * an op is all a rollback needs. Ops on a goal the server no longer has change nothing.
 */
export function applyPending(serverGoals: RoomGoal[], ops: PendingOp[]): ShownGoal[] {
  return ops.reduce<ShownGoal[]>(apply, serverGoals);
}
