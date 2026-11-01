import { addGoal, removeGoal, toggleGoal } from '../../modules/goals/goals.service';
import { onEvent } from '../handler';
import { getHostId } from '../presence';
import { roomChannel, type HandlerRegistrar } from '../types';
import { requireSocketInRoom } from './room.handlers';

/** goal:add, goal:toggle and goal:remove. Members only; removing is for the goal's author or the host. */
export function createGoalHandlers(): HandlerRegistrar {
  return (io, socket) => {
    onEvent(io, socket, 'goal:add', async ({ roomId, text }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      const goals = await addGoal(roomId, userId, text);
      io.to(roomChannel(roomId)).emit('goal:update', { roomId, goals });
      return {};
    });

    onEvent(io, socket, 'goal:toggle', async ({ roomId, goalId }) => {
      requireSocketInRoom(roomId, socket);
      const goals = await toggleGoal(roomId, goalId);
      io.to(roomChannel(roomId)).emit('goal:update', { roomId, goals });
      return {};
    });

    onEvent(io, socket, 'goal:remove', async ({ roomId, goalId }, { userId }) => {
      requireSocketInRoom(roomId, socket);
      // Presence knows the current host, hand-overs included; checked on every call.
      const goals = await removeGoal(roomId, goalId, userId, getHostId(roomId) === userId);
      io.to(roomChannel(roomId)).emit('goal:update', { roomId, goals });
      return {};
    });
  };
}
