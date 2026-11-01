import { AppError } from '../../lib/errors';

// One answer for missing rooms and private rooms you can't see, so ids can't be probed.
export const roomNotFound = () =>
  new AppError(404, 'ROOM_NOT_FOUND', 'We couldn’t find that room. Check the link and try again.');

export const roomClosed = () => new AppError(410, 'ROOM_CLOSED', 'This room has ended.');
