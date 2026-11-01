import { AppError } from '../../lib/errors';

// A cursor is only ever one we sent, so a bad one is a broken link rather than something to explain.
export const invalidCursor = () =>
  new AppError(400, 'VALIDATION_ERROR', 'That page of your history is not valid. Start again from the top.');
