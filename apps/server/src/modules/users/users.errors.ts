import { AppError } from '../../lib/errors';

export const userNotFound = () => new AppError(404, 'USER_NOT_FOUND', 'We couldn’t find that person.');

export const cannotFollowSelf = () => new AppError(400, 'CANNOT_FOLLOW_SELF', 'You can’t follow yourself.');

export const wrongPassword = () =>
  new AppError(400, 'WRONG_PASSWORD', 'That password isn’t right. Try again.');

export const emailManagedByGoogle = () =>
  new AppError(
    400,
    'EMAIL_MANAGED_BY_GOOGLE',
    'Your email comes from your Google account, so it can’t be changed here.',
  );

export const confirmationMismatch = () =>
  new AppError(400, 'CONFIRMATION_MISMATCH', 'Type your username exactly to confirm.');

// A cursor is only ever one we sent, so a bad one is a broken link rather than something to explain.
export const invalidFollowCursor = () =>
  new AppError(400, 'VALIDATION_ERROR', 'That page of the list is not valid. Start again from the top.');
