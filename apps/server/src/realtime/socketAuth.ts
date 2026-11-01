import type { SocketError } from '@studibrowse/shared';
import { AppError } from '../lib/errors';
import { unauthenticated } from '../modules/auth/auth.errors';
import { verifyAccessToken } from '../modules/auth/tokens';
import type { TypedSocket } from './types';

/** Socket.IO hands `data` to the client's connect_error listener, so it carries the code the client acts on. */
export type ConnectError = Error & { data: SocketError };

export function toConnectError(err: unknown): ConnectError {
  const { code, message } = err instanceof AppError ? err : unauthenticated();
  return Object.assign(new Error(message), { data: { code, message } });
}

/**
 * io.use() middleware: verifies the access token from `io(url, { auth: { token } })` and stores the user id on
 * socket.data. Rejects with UNAUTHENTICATED or TOKEN_EXPIRED; the client refreshes and reconnects on the latter.
 */
export function socketAuth(socket: TypedSocket, next: (err?: Error) => void): void {
  const token: unknown = socket.handshake.auth.token;
  try {
    if (typeof token !== 'string' || token === '') throw unauthenticated();
    socket.data.userId = verifyAccessToken(token);
    next();
  } catch (err) {
    next(toConnectError(err));
  }
}
