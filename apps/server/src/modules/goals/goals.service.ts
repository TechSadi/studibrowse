import { Types } from 'mongoose';
import { MAX_GOALS, type RoomGoal } from '@studibrowse/shared';
import { Room } from '../rooms/room.model';
import { roomClosed, roomNotFound } from '../rooms/rooms.errors';
import { toRoomGoal, type RoomRecord } from '../rooms/rooms.serializer';
import { goalExists, goalLimit, goalNotFound, notGoalAuthor } from './goals.errors';

type GoalRecord = RoomRecord['goals'][number];
type GoalsOnly = Pick<RoomRecord, 'goals' | 'closedAt'>;

const GOAL_FIELDS = { goals: 1, closedAt: 1 } as const;
const AFTER = { returnDocument: 'after', projection: GOAL_FIELDS } as const;

/** The author of a goal or the room's current host can remove it. */
export function canRemoveGoal(addedBy: string, userId: string, isHost: boolean): boolean {
  return isHost || addedBy === userId;
}

async function openRoomGoals(roomId: string): Promise<GoalRecord[]> {
  const room = await Room.findById(roomId, GOAL_FIELDS).lean<GoalsOnly>();
  if (!room) throw roomNotFound();
  if (room.closedAt) throw roomClosed();
  return room.goals;
}

function findGoal(goals: GoalRecord[], goalId: string): GoalRecord {
  const goal = goals.find((g) => g._id.equals(goalId));
  if (!goal) throw goalNotFound();
  return goal;
}

/** `text` is already trimmed and checked by the shared goalAddSchema. */
export async function addGoal(roomId: string, userId: string, text: string): Promise<RoomGoal[]> {
  // One atomic update, so two people adding at once can't take the room past MAX_GOALS.
  const room = await Room.findOneAndUpdate(
    {
      _id: roomId,
      closedAt: null,
      [`goals.${MAX_GOALS - 1}`]: { $exists: false },
      'goals.text': { $ne: text },
    },
    { $push: { goals: { text, done: false, addedBy: new Types.ObjectId(userId) } } },
    AFTER,
  ).lean<GoalsOnly>();
  if (room) return room.goals.map(toRoomGoal);

  const goals = await openRoomGoals(roomId);
  if (goals.length >= MAX_GOALS) throw goalLimit();
  throw goalExists();
}

/** Any member can tick or untick any goal. */
export async function toggleGoal(roomId: string, goalId: string): Promise<RoomGoal[]> {
  const id = new Types.ObjectId(goalId);
  const room = await Room.findOneAndUpdate(
    { _id: roomId, closedAt: null, 'goals._id': id },
    [
      {
        $set: {
          goals: {
            $map: {
              input: '$goals',
              as: 'goal',
              in: {
                $cond: [
                  { $eq: ['$$goal._id', id] },
                  { $mergeObjects: ['$$goal', { done: { $not: ['$$goal.done'] } }] },
                  '$$goal',
                ],
              },
            },
          },
        },
      },
    ],
    { ...AFTER, updatePipeline: true },
  ).lean<GoalsOnly>();
  if (room) return room.goals.map(toRoomGoal);

  // The room is open, so the goal is what's missing.
  await openRoomGoals(roomId);
  throw goalNotFound();
}

export async function removeGoal(
  roomId: string,
  goalId: string,
  userId: string,
  isHost: boolean,
): Promise<RoomGoal[]> {
  const goal = findGoal(await openRoomGoals(roomId), goalId);
  if (!canRemoveGoal(goal.addedBy.toString(), userId, isHost)) throw notGoalAuthor();

  const room = await Room.findOneAndUpdate(
    { _id: roomId, closedAt: null },
    { $pull: { goals: { _id: goal._id } } },
    AFTER,
  ).lean<GoalsOnly>();
  if (!room) throw roomClosed();
  return room.goals.map(toRoomGoal);
}
