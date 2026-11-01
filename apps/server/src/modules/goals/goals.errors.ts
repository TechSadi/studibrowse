import { MAX_GOALS } from '@studibrowse/shared';
import { AppError } from '../../lib/errors';

export const goalNotFound = () =>
  new AppError(404, 'GOAL_NOT_FOUND', 'That goal isn’t in the room any more.');

export const goalLimit = () => new AppError(409, 'GOAL_LIMIT', `A room can have up to ${MAX_GOALS} goals.`);

// The host's Room settings match goals by text, so two goals with the same text would merge.
export const goalExists = () => new AppError(409, 'GOAL_EXISTS', 'The room already has that goal.');

export const notGoalAuthor = () =>
  new AppError(403, 'NOT_GOAL_AUTHOR', 'Only the person who added a goal or the host can remove it.');
