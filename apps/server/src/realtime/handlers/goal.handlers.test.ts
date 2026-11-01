import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GOAL_TEXT_MAX, MAX_GOALS, type RoomGoal, type ServerToClientEvents } from '@studibrowse/shared';
import { Room } from '../../modules/rooms/room.model';
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
import { GOAL_RATE_LIMIT } from '../socketRateLimit';
import { createGoalHandlers } from './goal.handlers';
import { createRoomHandlers } from './room.handlers';

useTestDatabase();

const roomHandlers = createRoomHandlers({ reconnectGraceMs: 200 });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({ registerHandlers: [roomHandlers.register, createGoalHandlers()] });
});

afterEach(() => {
  roomHandlers.dispose();
  resetPresence();
});

afterAll(async () => {
  await server.close();
});

async function openRoom(hostId: string, goals: string[]) {
  return createRoom(hostId, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic: true,
    maxSize: 10,
    goals,
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

/** `members` people in one room. The first is the host and added `goals`. */
async function roomWith(
  members: number,
  goals: string[] = [],
): Promise<{ people: ConnectedUser[]; roomId: string; goals: RoomGoal[] }> {
  const people = await server.connectUsers(members);
  const room = await openRoom(people[0]!.user.id, goals);
  for (const person of people) await joinOk(person.client, room.id);
  return { people, roomId: room.id, goals: room.goals };
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

async function storedGoals(roomId: string) {
  const room = await Room.findById(roomId).lean();
  return room!.goals.map((goal) => ({ text: goal.text, done: goal.done, addedBy: goal.addedBy.toString() }));
}

const goalTexts = (n: number) => Array.from({ length: n }, (_, i) => `Goal ${i + 1}`);
const missingGoalId = '64b7f0c2a1b2c3d4e5f60799';

describe('goal:add', () => {
  it('saves a trimmed goal and sends the goals to everyone in the room', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const heard = [nextEvent(alice.client, 'goal:update'), nextEvent(bob.client, 'goal:update')];

    const ack = await emitAck(bob.client, 'goal:add', { roomId, text: '  Finish one past paper  ' });

    expect(ack).toEqual({ ok: true, data: {} });
    const expected = { text: 'Finish one past paper', done: false, addedBy: bob.user.id };
    for (const payload of await Promise.all(heard)) {
      expect(payload).toEqual({ roomId, goals: [{ id: expect.any(String) as unknown, ...expected }] });
    }
    expect(await storedGoals(roomId)).toEqual([expected]);
  });

  it(`accepts up to ${MAX_GOALS} goals, then refuses with GOAL_LIMIT`, async () => {
    const { people, roomId } = await roomWith(2, goalTexts(MAX_GOALS - 1));
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];

    const delivered = nextEvent(bob.client, 'goal:update');
    expect((await emitAck(alice.client, 'goal:add', { roomId, text: 'The tenth' })).ok).toBe(true);
    await delivered;

    const silence = expectSilence(bob.client, 'goal:update');
    const refused = await emitAck(alice.client, 'goal:add', { roomId, text: 'One too many' });
    expect(refused).toMatchObject({ ok: false, error: { code: 'GOAL_LIMIT' } });
    await silence;
    expect(await storedGoals(roomId)).toHaveLength(MAX_GOALS);
  });

  it('lets only one of two adds racing for the last place through', async () => {
    const { people, roomId } = await roomWith(2, goalTexts(MAX_GOALS - 1));
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];

    const acks = await Promise.all([
      emitAck(alice.client, 'goal:add', { roomId, text: 'Alice’s goal' }),
      emitAck(bob.client, 'goal:add', { roomId, text: 'Bob’s goal' }),
    ]);

    expect(acks.filter((ack) => ack.ok)).toHaveLength(1);
    expect(acks.find((ack) => !ack.ok)).toMatchObject({ error: { code: 'GOAL_LIMIT' } });
    expect(await storedGoals(roomId)).toHaveLength(MAX_GOALS);
  });

  it('refuses a goal the room already has', async () => {
    const { people, roomId } = await roomWith(1, ['Finish set 3']);
    const ack = await emitAck(people[0]!.client, 'goal:add', { roomId, text: ' Finish set 3 ' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'GOAL_EXISTS' } });
    expect(await storedGoals(roomId)).toHaveLength(1);
  });

  it(`accepts exactly ${GOAL_TEXT_MAX} characters and rejects invalid payloads`, async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const delivered = nextEvent(bob.client, 'goal:update');
    const longest = await emitAck(alice.client, 'goal:add', { roomId, text: 'x'.repeat(GOAL_TEXT_MAX) });
    expect(longest.ok).toBe(true);
    await delivered;

    const silence = expectSilence(bob.client, 'goal:update', 300);
    const invalid: unknown[] = [
      { roomId, text: '' },
      { roomId, text: '   ' },
      { roomId, text: 'y'.repeat(GOAL_TEXT_MAX + 1) },
      { roomId, text: 'Sneaky', done: true },
      { roomId: 'not-an-id', text: 'Hi' },
    ];
    for (const payload of invalid) {
      // Sent raw: the typed helper wouldn't let these through.
      const ack = await emitAck(alice.client, 'goal:add', payload as { roomId: string; text: string });
      expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    }
    await silence;
    expect(await storedGoals(roomId)).toHaveLength(1);
  });

  it('refuses someone who isn’t in the room', async () => {
    const { people, roomId } = await roomWith(1);
    const [outsider] = await server.connectUsers(1);
    const silence = expectSilence(people[0]!.client, 'goal:update');

    const ack = await emitAck(outsider!.client, 'goal:add', { roomId, text: 'Let me in' });

    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
    await silence;
    expect(await storedGoals(roomId)).toHaveLength(0);
  });

  it('refuses once the room has closed', async () => {
    const { people, roomId } = await roomWith(1);
    await Room.updateOne({ _id: roomId }, { closedAt: new Date() });
    const ack = await emitAck(people[0]!.client, 'goal:add', { roomId, text: 'Too late' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'ROOM_CLOSED' } });
  });
});

describe('goal:toggle', () => {
  it('lets any member tick and untick any goal, and tells everyone', async () => {
    const { people, roomId, goals } = await roomWith(2, ['Finish set 3', 'Read chapter 4']);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const goalId = goals[1]!.id;

    const ticked = nextEvent(alice.client, 'goal:update');
    expect(await emitAck(bob.client, 'goal:toggle', { roomId, goalId })).toEqual({ ok: true, data: {} });
    expect((await ticked).goals.map((goal) => goal.done)).toEqual([false, true]);

    const unticked = nextEvent(bob.client, 'goal:update');
    expect((await emitAck(alice.client, 'goal:toggle', { roomId, goalId })).ok).toBe(true);
    expect((await unticked).goals.map((goal) => goal.done)).toEqual([false, false]);
  });

  it('answers GOAL_NOT_FOUND for a goal the room doesn’t have', async () => {
    const { people, roomId } = await roomWith(1, ['Finish set 3']);
    const ack = await emitAck(people[0]!.client, 'goal:toggle', { roomId, goalId: missingGoalId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'GOAL_NOT_FOUND' } });
  });

  it('refuses someone who isn’t in the room', async () => {
    const { roomId, goals } = await roomWith(1, ['Finish set 3']);
    const [outsider] = await server.connectUsers(1);
    const ack = await emitAck(outsider!.client, 'goal:toggle', { roomId, goalId: goals[0]!.id });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
    expect((await storedGoals(roomId))[0]!.done).toBe(false);
  });

  it(`allows ${GOAL_RATE_LIMIT.limit} per socket in the window, then rate limits`, async () => {
    const { people, roomId, goals } = await roomWith(1, ['Finish set 3']);
    const client = people[0]!.client;
    const goalId = goals[0]!.id;
    for (let i = 0; i < GOAL_RATE_LIMIT.limit; i++) {
      expect((await emitAck(client, 'goal:toggle', { roomId, goalId })).ok).toBe(true);
    }
    const blocked = await emitAck(client, 'goal:toggle', { roomId, goalId });
    expect(blocked).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});

describe('goal:remove', () => {
  async function addAs(person: ConnectedUser, roomId: string, text: string): Promise<string> {
    const update = nextEvent(person.client, 'goal:update');
    const ack = await emitAck(person.client, 'goal:add', { roomId, text });
    if (!ack.ok) throw new Error(ack.error.code);
    return (await update).goals.find((goal) => goal.text === text)!.id;
  }

  it('lets the author remove their own goal, and tells everyone', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const goalId = await addAs(bob, roomId, 'Bob’s goal');

    const heard = nextEvent(alice.client, 'goal:update');
    expect(await emitAck(bob.client, 'goal:remove', { roomId, goalId })).toEqual({ ok: true, data: {} });
    expect(await heard).toEqual({ roomId, goals: [] });
    expect(await storedGoals(roomId)).toEqual([]);
  });

  it('refuses another member with NOT_GOAL_AUTHOR and changes nothing', async () => {
    const { people, roomId } = await roomWith(3);
    const [alice, bob, carol] = people as [ConnectedUser, ConnectedUser, ConnectedUser];
    const goalId = await addAs(bob, roomId, 'Bob’s goal');
    const silence = expectSilence(alice.client, 'goal:update');

    const ack = await emitAck(carol.client, 'goal:remove', { roomId, goalId });

    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_GOAL_AUTHOR' } });
    await silence;
    expect(await storedGoals(roomId)).toHaveLength(1);
  });

  it('lets the host remove anyone’s goal', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const goalId = await addAs(bob, roomId, 'Bob’s goal');

    expect((await emitAck(alice.client, 'goal:remove', { roomId, goalId })).ok).toBe(true);
    expect(await storedGoals(roomId)).toEqual([]);
  });

  it('follows a host hand-over: the new host can remove, the old one can’t', async () => {
    const { people, roomId } = await roomWith(3);
    const [alice, bob, carol] = people as [ConnectedUser, ConnectedUser, ConnectedUser];
    const firstGoal = await addAs(carol, roomId, 'Carol’s first goal');
    const secondGoal = await addAs(carol, roomId, 'Carol’s second goal');

    // Alice (the host) leaves, so Bob, the longest present, becomes host. Alice comes back as a member.
    expect((await emitAck(alice.client, 'room:leave', { roomId })).ok).toBe(true);
    await joinOk(alice.client, roomId);

    const refused = await emitAck(alice.client, 'goal:remove', { roomId, goalId: firstGoal });
    expect(refused).toMatchObject({ ok: false, error: { code: 'NOT_GOAL_AUTHOR' } });
    expect((await emitAck(bob.client, 'goal:remove', { roomId, goalId: secondGoal })).ok).toBe(true);
    expect((await storedGoals(roomId)).map((goal) => goal.text)).toEqual(['Carol’s first goal']);
  });

  it('answers GOAL_NOT_FOUND for a goal the room doesn’t have', async () => {
    const { people, roomId } = await roomWith(1);
    const ack = await emitAck(people[0]!.client, 'goal:remove', { roomId, goalId: missingGoalId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'GOAL_NOT_FOUND' } });
  });

  it('refuses the goal’s author once they’ve left the room', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const goalId = await addAs(bob, roomId, 'Bob’s goal');
    expect((await emitAck(bob.client, 'room:leave', { roomId })).ok).toBe(true);
    const silence = expectSilence(alice.client, 'goal:update');

    const ack = await emitAck(bob.client, 'goal:remove', { roomId, goalId });

    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
    await silence;
    expect(await storedGoals(roomId)).toHaveLength(1);
  });
});
