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
