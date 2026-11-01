import { AppError } from '../../lib/errors';

export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.');

/** The client refreshes once and retries when it sees this code. */
export const accessTokenExpired = () =>
  new AppError(401, 'TOKEN_EXPIRED', 'Your session token expired. Refresh it and try again.');

export const refreshTokenReused = () =>
  new AppError(401, 'REFRESH_TOKEN_REUSED', 'For your security this session was ended. Please log in again.');

// One message for unknown accounts and wrong passwords, so the form can't be used to find accounts.
export const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'That email or username and password don’t match.');

export const emailTaken = () =>
  new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');

export const usernameTaken = (username: string) =>
  new AppError(409, 'USERNAME_TAKEN', `@${username} is taken.`);

// One answer for unknown, used and expired links: the client only needs to offer a new one.
export const resetTokenInvalid = () =>
  new AppError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired. Request a new one.');

export const googleTokenInvalid = () =>
  new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed. Please try again.');

/** The email belongs to an account already linked to a different Google account. */
export const googleAccountConflict = () =>
  new AppError(
    409,
    'GOOGLE_ACCOUNT_CONFLICT',
    'This email is linked to a different Google account. Sign in with that one or use your password.',
  );

export const googleNotConfigured = () =>
  new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not available right now.');
