import { AppError } from '../../lib/errors';

export const notificationNotFound = () =>
  new AppError(404, 'NOTIFICATION_NOT_FOUND', 'That notification doesn’t exist or was removed.');

// A cursor is only ever one we sent, so a bad one is a broken link rather than something to explain.
export const invalidCursor = () =>
  new AppError(
    400,
    'VALIDATION_ERROR',
    'That page of your notifications is not valid. Start again from the top.',
  );
