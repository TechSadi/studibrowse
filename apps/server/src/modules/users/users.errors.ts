import { AppError } from '../../lib/errors';

export const userNotFound = () => new AppError(404, 'USER_NOT_FOUND', 'We couldn’t find that person.');

export const cannotFollowSelf = () => new AppError(400, 'CANNOT_FOLLOW_SELF', 'You can’t follow yourself.');

// A cursor is only ever one we sent, so a bad one is a broken link rather than something to explain.
export const invalidFollowCursor = () =>
  new AppError(400, 'VALIDATION_ERROR', 'That page of the list is not valid. Start again from the top.');
