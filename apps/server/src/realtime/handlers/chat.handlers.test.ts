import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CHAT_TEXT_MAX, type ServerToClientEvents } from '@studibrowse/shared';
import { Message } from '../../modules/chat/message.model';
import { createRoom } from '../../modules/rooms/rooms.service';
import {
  emitAck,
  nextEvent,
  startSocketServer,
  type ConnectedUser,
  type TestClient,
  type TestSocketServer,
} from '../../test/socketHelpers';
import { useTestDatabase } from '../../test/testDb';
import { resetPresence } from '../presence';
import { CHAT_RATE_LIMIT } from '../socketRateLimit';
import { createChatHandlers } from './chat.handlers';
import { createRoomHandlers } from './room.handlers';

useTestDatabase();

const roomHandlers = createRoomHandlers({ reconnectGraceMs: 200 });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({ registerHandlers: [roomHandlers.register, createChatHandlers()] });
});

afterEach(() => {
  roomHandlers.dispose();
  resetPresence();
});

afterAll(async () => {
  await server.close();
});

async function openRoom(hostId: string) {
  return createRoom(hostId, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic: true,
    maxSize: 10,
    goals: [],
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: false,
    },
  });
}

async function joinOk(client: TestClient, roomId: string) {
  const ack = await emitAck(client, 'room:join', { roomId });
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
}

/** `members` people, all in one room. */
async function roomWith(members: number): Promise<{ people: ConnectedUser[]; roomId: string }> {
  const people = await server.connectUsers(members);
  const room = await openRoom(people[0]!.user.id);
  for (const person of people) await joinOk(person.client, room.id);
  return { people, roomId: room.id };
}

/** Resolves once `ms` pass with no `event` on `client`; fails if one arrives. */
function expectSilence(client: TestClient, event: keyof ServerToClientEvents, ms = 150): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = () => reject(new Error(`Unexpected ${event}`));
    client.once(event, listener);
    setTimeout(() => {
      client.off(event, listener);
      resolve();
    }, ms);
  });
}

const savedCount = (roomId: string) => Message.countDocuments({ roomId });

describe('chat:send', () => {
  it('saves a trimmed message and sends it to everyone in the room, sender included', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const heard = [nextEvent(alice.client, 'chat:new'), nextEvent(bob.client, 'chat:new')];

    const ack = await emitAck(alice.client, 'chat:send', { roomId, text: '  Back after the break!  ' });

    if (!ack.ok) throw new Error(ack.error.code);
    const { message } = ack.data;
    expect(message).toEqual({
      id: expect.any(String) as unknown,
      roomId,
      userId: alice.user.id,
      text: 'Back after the break!',
      createdAt: expect.any(String) as unknown,
    });
    for (const payload of await Promise.all(heard)) expect(payload).toEqual({ message });

    const stored = await Message.findById(message.id).lean();
    expect(stored).toMatchObject({ text: 'Back after the break!' });
    expect(stored?.userId.toString()).toBe(alice.user.id);
  });

  it(`accepts exactly ${CHAT_TEXT_MAX} characters`, async () => {
    const { people, roomId } = await roomWith(1);
    const ack = await emitAck(people[0]!.client, 'chat:send', { roomId, text: 'a'.repeat(CHAT_TEXT_MAX) });
    expect(ack.ok).toBe(true);
    expect(await savedCount(roomId)).toBe(1);
  });

  it('rejects invalid payloads without saving or sending anything', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const silence = expectSilence(bob.client, 'chat:new', 300);

    const invalid: unknown[] = [
      { roomId, text: '' },
      { roomId, text: '   \n  ' },
      { roomId, text: 'a'.repeat(CHAT_TEXT_MAX + 1) },
      { roomId, text: 'hi', userId: bob.user.id },
      { roomId: 'not-an-id', text: 'hi' },
    ];
    for (const payload of invalid) {
      // Sent raw: the typed helper wouldn't let these through.
      const ack = await emitAck(alice.client, 'chat:send', payload as { roomId: string; text: string });
      expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    }

    await silence;
    expect(await savedCount(roomId)).toBe(0);
  });

  it(`allows ${CHAT_RATE_LIMIT.limit} messages per socket in the window, then rate limits`, async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];

    for (let i = 0; i < CHAT_RATE_LIMIT.limit; i++) {
      // Wait for Bob's copy too, so it can't arrive during the silence check below.
      const delivered = nextEvent(bob.client, 'chat:new');
      const ack = await emitAck(alice.client, 'chat:send', { roomId, text: `message ${i}` });
      expect(ack.ok).toBe(true);
      await delivered;
    }
    const silence = expectSilence(bob.client, 'chat:new');
    const blocked = await emitAck(alice.client, 'chat:send', { roomId, text: 'one too many' });

    expect(blocked).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    await silence;
    expect(await savedCount(roomId)).toBe(CHAT_RATE_LIMIT.limit);

    // The limit is per socket: someone else in the room can still talk.
    expect((await emitAck(bob.client, 'chat:send', { roomId, text: 'Hi Alice' })).ok).toBe(true);
  });

  describe('non-members', () => {
    async function expectRefused(outsider: ConnectedUser, roomId: string, listener: TestClient) {
      const silence = expectSilence(listener, 'chat:new');
      const ack = await emitAck(outsider.client, 'chat:send', { roomId, text: 'Let me in' });
      expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
      await silence;
      expect(await savedCount(roomId)).toBe(0);
    }

    it('refuses someone who never joined', async () => {
      const { people, roomId } = await roomWith(1);
      const [outsider] = await server.connectUsers(1);
      await expectRefused(outsider!, roomId, people[0]!.client);
    });

    it('refuses someone who joined a different room', async () => {
      const { people, roomId } = await roomWith(1);
      const [outsider] = await server.connectUsers(1);
      const otherRoom = await openRoom(outsider!.user.id);
      await joinOk(outsider!.client, otherRoom.id);
      await expectRefused(outsider!, roomId, people[0]!.client);
    });

    it('refuses someone who has left', async () => {
      const { people, roomId } = await roomWith(2);
      const [alice, bob] = people as [ConnectedUser, ConnectedUser];
      expect((await emitAck(bob.client, 'room:leave', { roomId })).ok).toBe(true);
      await expectRefused(bob, roomId, alice.client);
    });
  });
});

describe('chat:typing', () => {
  it('tells the rest of the room, not the sender', async () => {
    const { people, roomId } = await roomWith(3);
    const [alice, bob, carol] = people as [ConnectedUser, ConnectedUser, ConnectedUser];
    const heard = [nextEvent(bob.client, 'chat:typing'), nextEvent(carol.client, 'chat:typing')];
    const silence = expectSilence(alice.client, 'chat:typing');

    alice.client.emit('chat:typing', { roomId, isTyping: true });

    for (const payload of await Promise.all(heard)) {
      expect(payload).toEqual({ roomId, userId: alice.user.id, isTyping: true });
    }
    await silence;
  });

  it('drops typing from someone outside the room', async () => {
    const { people, roomId } = await roomWith(1);
    const [outsider] = await server.connectUsers(1);
    const silence = expectSilence(people[0]!.client, 'chat:typing');

    outsider!.client.emit('chat:typing', { roomId, isTyping: true });

    await silence;
  });
});
