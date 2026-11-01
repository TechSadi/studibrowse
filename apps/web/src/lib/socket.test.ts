import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as api from './api';
import { ApiError, endSession, NETWORK_ERROR_CODE, refreshSession, setAccessToken } from './api';
import { connectSocket, disconnectSocket, emitWithAck, getSocketSnapshot } from './socket';

type Listener = (...args: unknown[]) => void;

/** Just enough of a socket.io-client Socket to drive the module from the outside. */
class FakeSocket {
  connected = false;
  listeners = new Map<string, Listener[]>();
  connect = vi.fn();
  disconnect = vi.fn();
  emitWithAck = vi.fn();
  constructor(readonly options: { auth: (cb: (data: object) => void) => void }) {}
  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  removeAllListeners() {
    this.listeners.clear();
    return this;
  }
  timeout() {
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
  handshakeAuth(): Promise<object> {
    return new Promise((resolve) => this.options.auth(resolve));
  }
}

const created = vi.hoisted(() => [] as unknown[]);

vi.mock('socket.io-client', () => ({
  io: (options: ConstructorParameters<typeof FakeSocket>[0]) => {
    const socket = new FakeSocket(options);
    created.push(socket);
    return socket;
  },
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  refreshSession: vi.fn(),
  endSession: vi.fn(),
}));

function open(): FakeSocket {
  connectSocket();
  return created.at(-1) as FakeSocket;
}

function connectError(code: string) {
  return Object.assign(new Error(code), { data: { code, message: code } });
}

/** Lets the refresh promise chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  created.length = 0;
  vi.mocked(refreshSession).mockReset();
  vi.mocked(endSession).mockReset();
  setAccessToken('first-token');
});

afterEach(() => {
  disconnectSocket();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('connectSocket', () => {
  it('creates one socket and connects it', () => {
    const socket = open();
    connectSocket();
    expect(created).toHaveLength(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(getSocketSnapshot().socket).toBe(socket);
  });

  it('sends the newest access token on every handshake', async () => {
    const socket = open();
    expect(await socket.handshakeAuth()).toEqual({ token: 'first-token' });
    setAccessToken('second-token');
    expect(await socket.handshakeAuth()).toEqual({ token: 'second-token' });
  });
});

describe('connection status', () => {
  it('is connecting, then connected, then reconnecting after a drop', () => {
    const socket = open();
    expect(getSocketSnapshot().status).toBe('connecting');

    socket.connected = true;
    socket.fire('connect');
    expect(getSocketSnapshot().status).toBe('connected');

    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    expect(getSocketSnapshot().status).toBe('reconnecting');
  });

  it('is reconnecting when the first attempt fails', () => {
    const socket = open();
    socket.fire('connect_error', new Error('xhr poll error'));
    expect(getSocketSnapshot().status).toBe('reconnecting');
  });

  it('is offline when the browser has no network', () => {
    open();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(getSocketSnapshot().status).toBe('offline');
  });

  it('retries straight away when the network comes back', () => {
    const socket = open();
    window.dispatchEvent(new Event('online'));
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('drops the socket on disconnectSocket', () => {
    const socket = open();
    disconnectSocket();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(getSocketSnapshot()).toEqual({ socket: null, status: 'connecting' });
  });
});

describe('auth errors', () => {
  it('refreshes an expired token and reconnects', async () => {
    vi.mocked(refreshSession).mockResolvedValue({} as never);
    const socket = open();

    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await flush();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('ends the session if the token is expired again right after a refresh', async () => {
    vi.mocked(refreshSession).mockResolvedValue({} as never);
    const socket = open();

    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await flush();
    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await flush();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('can refresh again after a successful connection', async () => {
    vi.mocked(refreshSession).mockResolvedValue({} as never);
    const socket = open();

    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await flush();
    socket.connected = true;
    socket.fire('connect');
    socket.connected = false;
    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await flush();

    expect(refreshSession).toHaveBeenCalledTimes(2);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('ends the session when the refresh is refused', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'no'));
    const socket = open();

    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await flush();

    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('tries again later when the refresh cannot reach the server', async () => {
    vi.useFakeTimers();
    vi.mocked(refreshSession).mockRejectedValue(new ApiError(0, NETWORK_ERROR_CODE, 'offline'));
    const socket = open();

    socket.fire('connect_error', connectError('TOKEN_EXPIRED'));
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);

    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('ends the session when the token is rejected outright', () => {
    const socket = open();
    socket.fire('connect_error', connectError('UNAUTHENTICATED'));
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe('emitWithAck', () => {
  const roomId = '64b7f0c2a1b2c3d4e5f60718';

  it('resolves with the ack data', async () => {
    const socket = open();
    socket.emitWithAck.mockResolvedValue({ ok: true, data: {} });
    await expect(emitWithAck('timer:start', { roomId })).resolves.toEqual({});
    expect(socket.emitWithAck).toHaveBeenCalledWith('timer:start', { roomId });
  });

  it('throws the server error as an ApiError', async () => {
    const socket = open();
    socket.emitWithAck.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_HOST', message: 'Only the host.' },
    });
    await expect(emitWithAck('timer:start', { roomId })).rejects.toMatchObject({
      code: 'NOT_HOST',
      message: 'Only the host.',
    });
  });

  it('throws NETWORK_ERROR when no ack arrives', async () => {
    const socket = open();
    socket.emitWithAck.mockRejectedValue(new Error('operation has timed out'));
    await expect(emitWithAck('timer:start', { roomId })).rejects.toMatchObject({ code: NETWORK_ERROR_CODE });
  });

  it('throws NETWORK_ERROR without a socket', async () => {
    await expect(emitWithAck('timer:start', { roomId })).rejects.toMatchObject({ code: NETWORK_ERROR_CODE });
  });
});
