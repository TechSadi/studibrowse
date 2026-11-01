import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  AckData,
  AckEventName,
  ClientPayload,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketError,
} from '@studibrowse/shared';
import { SOCKET_ERROR_CODES } from '@studibrowse/shared';
import { ApiError, endSession, getAccessToken, NETWORK_ERROR_CODE, refreshSession } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * `connecting` covers the first attempt (no indicator). `reconnecting` is any later attempt, after the connection
 * dropped or the first attempt failed. `offline` is the browser reporting no network.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface SocketSnapshot {
  socket: AppSocket | null;
  status: ConnectionStatus;
}

const ACK_TIMEOUT_MS = 10_000;
/** How long to wait before trying again when the token refresh itself couldn't reach the server. */
const REFRESH_RETRY_MS = 5_000;

const UNREACHABLE = 'Can’t reach StudiBrowse. Check your connection and try again.';

// One socket per tab, like the access token in api.ts. It exists only while signed in.
let socket: AppSocket | null = null;
let hadTrouble = false;
let refreshedSinceConnect = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let snapshot: SocketSnapshot = { socket: null, status: 'connecting' };
const listeners = new Set<() => void>();

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function currentStatus(): ConnectionStatus {
  if (socket?.connected) return 'connected';
  if (isBrowserOffline()) return 'offline';
  return hadTrouble ? 'reconnecting' : 'connecting';
}

function publish() {
  const status = currentStatus();
  if (snapshot.socket === socket && snapshot.status === status) return;
  snapshot = { socket, status };
  for (const listener of listeners) listener();
}

/**
 * The server rejected the handshake because the access token expired. Refresh once (refreshSession is
 * single-flight and locked across tabs) and connect again. A second expiry straight after a refresh means
 * something is wrong with the session, so end it.
 */
async function reconnectWithFreshToken(target: AppSocket) {
  if (refreshedSinceConnect) {
    endSession();
    return;
  }
  refreshedSinceConnect = true;
  try {
    await refreshSession();
  } catch (err) {
    if (err instanceof ApiError && err.code === NETWORK_ERROR_CODE) {
      // The server is unreachable, not the session invalid: try the whole thing again shortly.
      refreshedSinceConnect = false;
      retryTimer = setTimeout(() => socket === target && target.connect(), REFRESH_RETRY_MS);
      return;
    }
    endSession();
    return;
  }
  if (socket === target) target.connect();
}

function onConnectError(target: AppSocket, err: Error & { data?: SocketError }) {
  hadTrouble = true;
  publish();
  const code = err.data?.code;
  if (code === SOCKET_ERROR_CODES.tokenExpired) void reconnectWithFreshToken(target);
  else if (code === SOCKET_ERROR_CODES.unauthenticated) endSession();
  // Anything else is a transport error, which Socket.IO retries on its own with backoff.
}

function onBrowserOnline() {
  publish();
  // Skip the rest of the backoff wait now that the network is back.
  if (socket && !socket.connected) socket.connect();
}

/** Opens the socket for the signed-in user. Safe to call more than once. */
export function connectSocket(): AppSocket {
  if (socket) return socket;
  const created: AppSocket = io({
    autoConnect: false,
    // A function, so every reconnect sends the newest access token.
    auth: (cb) => cb({ token: getAccessToken() }),
  });
  socket = created;
  hadTrouble = false;
  refreshedSinceConnect = false;

  created.on('connect', () => {
    refreshedSinceConnect = false;
    publish();
  });
  created.on('disconnect', () => {
    hadTrouble = true;
    publish();
  });
  created.on('connect_error', (err) => onConnectError(created, err));
  window.addEventListener('online', onBrowserOnline);
  window.addEventListener('offline', publish);

  created.connect();
  publish();
  return created;
}

/** Closes the socket (logging out, or the session ended). */
export function disconnectSocket(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  window.removeEventListener('online', onBrowserOnline);
  window.removeEventListener('offline', publish);
  const closing = socket;
  socket = null;
  hadTrouble = false;
  closing?.removeAllListeners();
  closing?.disconnect();
  publish();
}

export function getSocket(): AppSocket | null {
  return socket;
}

/** For useSyncExternalStore. */
export function subscribeToSocket(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSocketSnapshot(): SocketSnapshot {
  return snapshot;
}

/**
 * Emits an acknowledged event and resolves with its data. Failures throw ApiError (status 0) with the server's
 * code, or NETWORK_ERROR when there is no answer, so screens handle socket and REST errors the same way.
 */
export async function emitWithAck<E extends AckEventName>(
  event: E,
  payload: ClientPayload<E>,
): Promise<AckData<E>> {
  if (!socket) throw new ApiError(0, NETWORK_ERROR_CODE, UNREACHABLE);
  const timed = socket.timeout(ACK_TIMEOUT_MS);
  // socket.io-client's emitWithAck types don't narrow on a generic event name.
  const emit = timed.emitWithAck as (event: E, payload: unknown) => Promise<Ack<AckData<E>>>;
  let response: Ack<AckData<E>>;
  try {
    response = await emit.call(timed, event, payload);
  } catch {
    throw new ApiError(0, NETWORK_ERROR_CODE, UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(0, response.error.code, response.error.message);
  return response.data;
}
