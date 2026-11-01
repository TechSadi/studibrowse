import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@studibrowse/shared';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { signAccessToken } from '../modules/auth/tokens';
import { createUserWithToken } from '../test/authHelpers';
import {
  emitAck,
  nextEvent,
  startSocketServer,
  type TestConnectError,
  type TestSocketServer,
} from '../test/socketHelpers';
import { useTestDatabase } from '../test/testDb';
import { onEvent, onSignal } from './handler';
import { CHAT_RATE_LIMIT, TYPING_RATE_LIMIT } from './socketRateLimit';
import { userRoom, type HandlerRegistrar } from './types';

useTestDatabase();

const roomId = new Types.ObjectId().toString();
const chatHandler = vi.fn();

/** Stand-ins for the real chat handlers, to exercise the wrapper. */
const testHandlers: HandlerRegistrar = (io, socket) => {
  onEvent(io, socket, 'chat:send', (payload, { userId }) => {
    chatHandler(payload);
    if (payload.text === 'app-error') throw new AppError(403, 'NOT_A_MEMBER', 'Join the room first.');
    if (payload.text === 'crash') throw new Error('E11000 duplicate key in messages');
    return {
      message: {
        id: 'm1',
        roomId: payload.roomId,
        userId,
        text: payload.text,
        createdAt: new Date(0).toISOString(),
      },
    };
  });
  onSignal(io, socket, 'chat:typing', ({ roomId: typingRoomId, isTyping }, { userId }) => {
    socket.broadcast.emit('chat:typing', { roomId: typingRoomId, userId, isTyping });
  });
};

let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({ registerHandlers: [testHandlers] });
});

afterAll(async () => {
  await server.close();
});

async function connectOne() {
  const [connected] = await server.connectUsers(1);
  return connected!;
}

async function rejectionOf(connecting: Promise<unknown>): Promise<TestConnectError> {
  try {
    await connecting;
  } catch (err) {
    return err as TestConnectError;
  }
  throw new Error('Expected the connection to be rejected');
}

describe('handshake auth', () => {
  it('rejects a socket without a token', async () => {
    const err = await rejectionOf(server.connect({}));
    expect(err.data).toEqual({ code: 'UNAUTHENTICATED', message: 'Please log in to continue.' });
  });

  it.each([
    ['a non-string token', 12345],
    ['an empty token', ''],
    ['a garbage token', 'not-a-jwt'],
    ['a token signed with another secret', jwt.sign({}, 'x'.repeat(40), { subject: roomId })],
    ['a token without a user id', jwt.sign({}, env.JWT_ACCESS_SECRET)],
  ])('rejects %s', async (_label, token) => {
    const err = await rejectionOf(server.connect({ token }));
    expect(err.data?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired token with TOKEN_EXPIRED, so the client knows to refresh', async () => {
    const expired = jwt.sign({}, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      subject: new Types.ObjectId().toString(),
      expiresIn: -10,
    });
    const err = await rejectionOf(server.connect({ token: expired }));
    expect(err.data?.code).toBe('TOKEN_EXPIRED');
  });

  it('connects several authenticated clients and stores the user id on the socket', async () => {
    const users = await server.connectUsers(3);
    expect(users.every(({ client }) => client.connected)).toBe(true);

    const sockets = await server.io.fetchSockets();
    const userIds = sockets.map((socket) => socket.data.userId);
    for (const { user } of users) expect(userIds).toContain(user.id);
  });
});

describe('private user rooms', () => {
  it('sends to every socket of that user and nobody else', async () => {
    const { user, token } = await createUserWithToken();
    const tabOne = await server.connectWithToken(token);
    const tabTwo = await server.connectWithToken(token);
    const [other] = await server.connectUsers(1);
    const otherHeard = vi.fn();
    other!.client.on('notification:new', otherHeard);

    const notification: AppNotification = {
      id: 'n1',
      type: 'roomStarted',
      roomId,
      text: 'Maya opened a room',
      read: false,
      createdAt: new Date().toISOString(),
    };
    const received = Promise.all([
      nextEvent(tabOne, 'notification:new'),
      nextEvent(tabTwo, 'notification:new'),
    ]);
    server.io.to(userRoom(user.id)).emit('notification:new', { notification });

    expect(await received).toEqual([{ notification }, { notification }]);
    expect(otherHeard).not.toHaveBeenCalled();
  });
});

describe('handler wrapper', () => {
  it('acks the handler result with the validated, trimmed payload', async () => {
    const { user, client } = await connectOne();
    chatHandler.mockClear();

    const ack = await emitAck(client, 'chat:send', { roomId, text: '  hello  ' });

    expect(chatHandler).toHaveBeenCalledWith({ roomId, text: 'hello' });
    expect(ack).toEqual({
      ok: true,
      data: { message: expect.objectContaining({ text: 'hello', userId: user.id }) as unknown },
    });
  });

  it('acks VALIDATION_ERROR and never calls the handler for a bad payload', async () => {
    const { client } = await connectOne();
    chatHandler.mockClear();

    const ack = await emitAck(client, 'chat:send', { roomId, text: '' });

    expect(ack).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Messages can’t be empty.' },
    });
    expect(chatHandler).not.toHaveBeenCalled();
  });

  it('acks an AppError with its own code and message', async () => {
    const { client } = await connectOne();

    const ack = await emitAck(client, 'chat:send', { roomId, text: 'app-error' });

    expect(ack).toEqual({ ok: false, error: { code: 'NOT_A_MEMBER', message: 'Join the room first.' } });
  });

  it('acks a generic INTERNAL_ERROR for anything else, without leaking the message', async () => {
    const { client } = await connectOne();

    const ack = await emitAck(client, 'chat:send', { roomId, text: 'crash' });

    expect(ack).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  it('survives a client that sends no ack callback', async () => {
    const { client } = await connectOne();
    chatHandler.mockClear();

    (client.emit as (event: string, payload: unknown) => void)('chat:send', { roomId, text: 'no ack' });

    await vi.waitFor(() => expect(chatHandler).toHaveBeenCalled());
    expect(client.connected).toBe(true);
  });
});

describe('rate limits', () => {
  it(`allows ${CHAT_RATE_LIMIT.limit} chat messages per socket, then acks RATE_LIMITED`, async () => {
    const [first, second] = await server.connectUsers(2);

    for (let i = 0; i < CHAT_RATE_LIMIT.limit; i += 1) {
      expect((await emitAck(first!.client, 'chat:send', { roomId, text: `m${i}` })).ok).toBe(true);
    }
    const limited = await emitAck(first!.client, 'chat:send', { roomId, text: 'one more' });
    expect(limited).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });

    // Another socket has its own budget.
    expect((await emitAck(second!.client, 'chat:send', { roomId, text: 'hi' })).ok).toBe(true);
  });

  it(`delivers at most ${TYPING_RATE_LIMIT.limit} typing events per window and drops the rest`, async () => {
    const [typist, listener] = await server.connectUsers(2);
    const heard = vi.fn();
    listener!.client.on('chat:typing', heard);

    for (let i = 0; i < TYPING_RATE_LIMIT.limit + 5; i += 1) {
      typist!.client.emit('chat:typing', { roomId, isTyping: i % 2 === 0 });
    }

    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(TYPING_RATE_LIMIT.limit));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(heard).toHaveBeenCalledTimes(TYPING_RATE_LIMIT.limit);
  });
});

describe('tokens for deleted users', () => {
  // Same as REST's requireAuth: the token alone is checked. Handlers that need the user load it themselves.
  it('still connects with a valid signature', async () => {
    const client = await server.connectWithToken(signAccessToken(new Types.ObjectId().toString()));
    expect(client.connected).toBe(true);
  });
});
