import { mongo } from 'mongoose';
import { emailTaken, usernameTaken } from '../auth/auth.errors';

export function isDuplicateKey(error: unknown): error is mongo.MongoServerError {
  return error instanceof mongo.MongoServerError && error.code === 11000;
}

/** Maps a unique-index violation (two requests racing for the same email or username) to a 409. */
export function duplicateKeyError(error: unknown, username: string) {
  if (!isDuplicateKey(error)) return undefined;
  const keys = Object.keys((error.keyPattern as Record<string, unknown> | undefined) ?? {});
  if (keys.includes('email')) return emailTaken();
  if (keys.includes('username')) return usernameTaken(username);
  return undefined;
}
