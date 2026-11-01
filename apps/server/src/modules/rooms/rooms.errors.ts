import { AppError } from '../../lib/errors';

// One answer for missing rooms and private rooms you can't see, so ids can't be probed.
export const roomNotFound = () =>
  new AppError(404, 'ROOM_NOT_FOUND', 'We couldn’t find that room. Check the link and try again.');

export const roomClosed = () => new AppError(410, 'ROOM_CLOSED', 'This room has ended.');

export const roomFull = () =>
  new AppError(409, 'ROOM_FULL', 'This room is full. Try another room or open your own.');

export const notAMember = () => new AppError(403, 'NOT_A_MEMBER', 'Join the room first.');

export const notHost = () => new AppError(403, 'NOT_HOST', 'Only the host can control the timer.');

export const invalidTimerCommand = (message: string) => new AppError(409, 'INVALID_TIMER_COMMAND', message);
