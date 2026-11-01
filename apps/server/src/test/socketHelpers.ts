import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import type {
  Ack,
  AckData,
  AckEventName,
  ClientPayload,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketError,
} from '@studibrowse/shared';
import { createApp } from '../app';
import type { UserDocument } from '../modules/users/user.model';
import { createIo } from '../realtime/io';
import type { HandlerRegistrar, TypedServer } from '../realtime/types';
import { createUserWithToken } from './authHelpers';

export type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

/** What connect() rejects with when the server refuses the handshake. */
export type TestConnectError = Error & { data?: SocketError };

export interface ConnectedUser {
  user: UserDocument;
  token: string;
  client: TestClient;
}

export interface TestSocketServer {
  url: string;
  io: TypedServer;
  /** Connects one client with `auth` as the handshake auth. Rejects with the connect_error. */
  connect: (auth: Record<string, unknown>) => Promise<TestClient>;
  /** Connects one client with an access token. */
  connectWithToken: (token: string) => Promise<TestClient>;
  /** Saves `count` users and connects one authenticated client for each. Needs useTestDatabase(). */
  connectUsers: (count: number) => Promise<ConnectedUser[]>;
  /** Disconnects every client and stops the server. */
  close: () => Promise<void>;
}

/** Starts the real HTTP + Socket.IO server on a random free port. */
export async function startSocketServer({
  registerHandlers = [],
}: { registerHandlers?: HandlerRegistrar[] } = {}): Promise<TestSocketServer> {
  const clientOrigin = 'http://localhost:5173';
  const httpServer = createServer(createApp({ isDatabaseConnected: () => true, clientOrigin }));
  const io = createIo(httpServer, { clientOrigin, registerHandlers });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const clients: TestClient[] = [];

  function connect(auth: Record<string, unknown>): Promise<TestClient> {
    const client: TestClient = connectClient(url, {
      auth,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once('connect', () => resolve(client));
      client.once('connect_error', (err: TestConnectError) => reject(err));
    });
  }

  const connectWithToken = (token: string) => connect({ token });

  async function connectUsers(count: number): Promise<ConnectedUser[]> {
    const users = await Promise.all(Array.from({ length: count }, () => createUserWithToken()));
    return Promise.all(
      users.map(async ({ user, token }) => ({ user, token, client: await connectWithToken(token) })),
    );
  }

  async function close(): Promise<void> {
    for (const client of clients) client.disconnect();
    // Also closes the HTTP server.
    await io.close();
  }

  return { url, io, connect, connectWithToken, connectUsers, close };
}

/** Emits an acknowledged event and waits for the ack (fails after 2 s). */
export function emitAck<E extends AckEventName>(
  client: TestClient,
  event: E,
  payload: ClientPayload<E>,
): Promise<Ack<AckData<E>>> {
  const timed = client.timeout(2000);
  // socket.io-client's emitWithAck types don't narrow on a generic event name.
  const emit = timed.emitWithAck as (event: E, payload: unknown) => Promise<Ack<AckData<E>>>;
  return emit.call(timed, event, payload);
}

/** Resolves with the next payload of `event` on `client`, or rejects after `ms`. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  client: TestClient,
  event: E,
  ms = 2000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${event} within ${ms} ms`)), ms);
    client.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}
