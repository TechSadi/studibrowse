import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TimerSettings } from '@studibrowse/shared';
import { purgeRoomContent } from '../../jobs/roomCleanup';
import { Message } from '../../modules/chat/message.model';
import { Room } from '../../modules/rooms/room.model';
import { createRoom } from '../../modules/rooms/rooms.service';
import { Session } from '../../modules/sessions/session.model';
import { createFakeStorage } from '../../test/fakeStorage';
import {
  emitAck,
  nextEvent,
  startSocketServer,
  type TestClient,
  type TestSocketServer,
} from '../../test/socketHelpers';
import { useTestDatabase } from '../../test/testDb';
import { countMembers, getHostId, listMembers, resetPresence } from '../presence';
import { createRoomTimer } from '../roomTimer';
import { createLobbyHandlers } from './lobby.handlers';
import { createRoomHandlers } from './room.handlers';
import { createTimerHandlers } from './timer.handlers';

useTestDatabase();

const MIN = 60_000;

// The server's clock runs `skewMs` ahead of the real one, so a test can let minutes "pass" instantly.
let skewMs = 0;
const clock = () => new Date(Date.now() + skewMs);
const storage = createFakeStorage();
const roomTimer = createRoomTimer({ now: clock });
const roomHandlers = createRoomHandlers({
  reconnectGraceMs: 200,
  onDepart: roomTimer.memberLeaving,
  onClosing: roomTimer.closing,
  onClosed: (roomId) => purgeRoomContent(storage, [roomId]),
  now: clock,
});
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({
    registerHandlers: [roomHandlers.register, createTimerHandlers(roomTimer), createLobbyHandlers()],
  });
});

afterEach(() => {
  skewMs = 0;
  roomHandlers.dispose();
  roomTimer.dispose();
  resetPresence();
});

afterAll(async () => {
  await server.close();
});

const timerSettings: TimerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: false,
};

async function joinOk(client: TestClient, roomId: string, inviteCode?: string) {
  const ack = await emitAck(client, 'room:join', inviteCode ? { roomId, inviteCode } : { roomId });
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
  return ack.data;
}

/** A host and `guests` others, all in one room. */
async function roomWith(guests: number, { isPublic = true, goals = [] as string[] } = {}) {
  const [host, ...others] = await server.connectUsers(guests + 1);
  const room = await createRoom(host!.user.id, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic,
    maxSize: 10,
    goals,
    timerSettings,
  });
  for (const member of [host!, ...others]) await joinOk(member.client, room.id, room.inviteCode ?? undefined);
  return { host: host!, guests: others, roomId: room.id, inviteCode: room.inviteCode! };
}

/** Collects every `event` a client hears, for checking what it did not get. */
function record(client: TestClient, event: 'presence:update' | 'room:closed') {
  const heard: unknown[] = [];
  client.on(event, (payload: unknown) => heard.push(payload));
  return heard;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type HostEvent = 'member:remove' | 'host:transfer';

describe.each<HostEvent>(['member:remove', 'host:transfer'])('%s permissions', (event) => {
  it('refuses someone who hasn’t joined the room', async () => {
    const { guests, roomId } = await roomWith(1);
    const [outsider] = await server.connectUsers(1);
    const ack = await emitAck(outsider!.client, event, { roomId, userId: guests[0]!.user.id });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
  });

  it('refuses a member who isn’t the host', async () => {
    const { host, guests, roomId } = await roomWith(2);
    const ack = await emitAck(guests[0]!.client, event, { roomId, userId: guests[1]!.user.id });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(getHostId(roomId)).toBe(host.user.id);
    expect(countMembers(roomId)).toBe(3);
  });

  it('refuses the host acting on themselves', async () => {
    const { host, roomId } = await roomWith(1);
    const ack = await emitAck(host.client, event, { roomId, userId: host.user.id });
    expect(ack).toMatchObject({ ok: false, error: { code: 'CANNOT_TARGET_SELF' } });
  });

  it('refuses someone who isn’t in the room', async () => {
    const { host, roomId } = await roomWith(1);
    const [outsider] = await server.connectUsers(1);
    const ack = await emitAck(host.client, event, { roomId, userId: outsider!.user.id });
    expect(ack).toMatchObject({ ok: false, error: { code: 'MEMBER_NOT_FOUND' } });
  });

  it('validates the payload', async () => {
    const { host, roomId } = await roomWith(1);
    const ack = await emitAck(host.client, event, { roomId, userId: 'nope' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('room:close permissions', () => {
  it('refuses someone who hasn’t joined the room', async () => {
    const { roomId } = await roomWith(0);
    const [outsider] = await server.connectUsers(1);
    const ack = await emitAck(outsider!.client, 'room:close', { roomId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
  });

  it('refuses a member who isn’t the host', async () => {
    const { guests, roomId } = await roomWith(1);
    const ack = await emitAck(guests[0]!.client, 'room:close', { roomId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect((await Room.findById(roomId).lean())!.closedAt).toBeNull();
  });

  it('answers ROOM_CLOSED for a room that has already closed', async () => {
    const { host, roomId } = await roomWith(0);
    await Room.updateOne({ _id: roomId }, { closedAt: new Date() });
    const ack = await emitAck(host.client, 'room:close', { roomId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'ROOM_CLOSED' } });
  });

  it('validates the payload', async () => {
    const { host, roomId } = await roomWith(0);
    const ack = await emitAck(host.client, 'room:close', { roomId, everyone: true } as never);
    expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('member:remove', () => {
  it('takes them out, tells every tab of theirs, and the room', async () => {
    const { host, guests, roomId } = await roomWith(2);
    const target = guests[0]!;
    const secondTab = await server.connectWithToken(target.token);
    await joinOk(secondTab, roomId);

    const removedFirst = nextEvent(target.client, 'room:removed');
    const removedSecond = nextEvent(secondTab, 'room:removed');
    const presence = nextEvent(guests[1]!.client, 'presence:update');
    const ack = await emitAck(host.client, 'member:remove', { roomId, userId: target.user.id });

    expect(ack).toEqual({ ok: true, data: {} });
    expect(await removedFirst).toEqual({ roomId });
    expect(await removedSecond).toEqual({ roomId });
    expect((await presence).members.map((member) => member.userId)).not.toContain(target.user.id);
    expect(listMembers(roomId).map((member) => member.userId)).not.toContain(target.user.id);
  });

  it('stops sending them the room’s events', async () => {
    const { host, guests, roomId } = await roomWith(1);
    const target = guests[0]!;
    await emitAck(host.client, 'member:remove', { roomId, userId: target.user.id });
    const heard = record(target.client, 'presence:update');

    await emitAck(host.client, 'status:set', { roomId, status: 'away' });
    await pause(50);
    expect(heard).toEqual([]);
    const ack = await emitAck(target.client, 'status:set', { roomId, status: 'away' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
  });

  it('won’t let them rejoin, even with the invite code of a private room', async () => {
    const { host, guests, roomId, inviteCode } = await roomWith(1, { isPublic: false });
    const target = guests[0]!;
    await emitAck(host.client, 'member:remove', { roomId, userId: target.user.id });

    const ack = await emitAck(target.client, 'room:join', { roomId, inviteCode });
    expect(ack).toMatchObject({ ok: false, error: { code: 'REMOVED_FROM_ROOM' } });
    const fresh = await server.connectWithToken(target.token);
    expect(await emitAck(fresh, 'room:join', { roomId, inviteCode })).toMatchObject({
      ok: false,
      error: { code: 'REMOVED_FROM_ROOM' },
    });
  });

  it('saves the focus time they had so far', async () => {
    const { host, guests, roomId } = await roomWith(1);
    const target = guests[0]!;
    await emitAck(host.client, 'timer:start', { roomId });
    skewMs = 9 * MIN;
    await emitAck(host.client, 'member:remove', { roomId, userId: target.user.id });

    const [session] = await Session.find().lean();
    expect(
      session?.participants.map(({ userId, focusedMins }) => ({ userId: userId.toString(), focusedMins })),
    ).toEqual([{ userId: target.user.id, focusedMins: 9 }]);
  });

  it('removes someone who is inside their reconnect window', async () => {
    const { host, guests, roomId } = await roomWith(1);
    const target = guests[0]!;
    target.client.disconnect();
    await pause(30);

    const ack = await emitAck(host.client, 'member:remove', { roomId, userId: target.user.id });
    expect(ack).toEqual({ ok: true, data: {} });
    expect(countMembers(roomId)).toBe(1);
    // Their reconnect window was cancelled: nothing changes when it would have ended.
    const heard = record(host.client, 'presence:update');
    await pause(250);
    expect(heard).toEqual([]);
  });
});

describe('host:transfer', () => {
  it('makes them host for everyone, in presence and the database', async () => {
    const { host, guests, roomId } = await roomWith(2);
    const target = guests[0]!;
    const presence = nextEvent(guests[1]!.client, 'presence:update');
    const ack = await emitAck(host.client, 'host:transfer', { roomId, userId: target.user.id });

    expect(ack).toEqual({ ok: true, data: {} });
    const { members } = await presence;
    expect(members.find((member) => member.isHost)?.userId).toBe(target.user.id);
    expect((await Room.findById(roomId).lean())!.hostId.toString()).toBe(target.user.id);
    expect(countMembers(roomId)).toBe(3);
  });

  it('moves the host controls: the new host runs the timer and the old one can’t', async () => {
    const { host, guests, roomId } = await roomWith(1);
    const target = guests[0]!;
    await emitAck(host.client, 'host:transfer', { roomId, userId: target.user.id });

    expect(await emitAck(host.client, 'timer:start', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    expect(await emitAck(target.client, 'timer:start', { roomId })).toEqual({ ok: true, data: {} });
    for (const event of ['member:remove', 'host:transfer'] as const) {
      expect(await emitAck(host.client, event, { roomId, userId: target.user.id })).toMatchObject({
        ok: false,
        error: { code: 'NOT_HOST' },
      });
    }
    expect(await emitAck(host.client, 'room:close', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
  });
});

describe('room:close', () => {
  it('logs the run, then tells everyone, and the room is gone', async () => {
    const { host, guests, roomId } = await roomWith(1, { goals: ['Read chapter 4'] });
    await Message.create({ roomId, userId: host.user.id, text: 'Hello' });
    await emitAck(host.client, 'timer:start', { roomId });
    skewMs = 10 * MIN;

    const closedForGuest = nextEvent(guests[0]!.client, 'room:closed');
    const closedForHost = nextEvent(host.client, 'room:closed');
    const ack = await emitAck(host.client, 'room:close', { roomId });

    expect(ack).toEqual({ ok: true, data: {} });
    expect(await closedForGuest).toEqual({ roomId });
    expect(await closedForHost).toEqual({ roomId });
    const [session] = await Session.find().lean();
    expect(session).toMatchObject({ goalsTotal: 1 });
    expect(session!.endedAt).not.toBeNull();
    expect(session!.participants).toHaveLength(2);

    const room = (await Room.findById(roomId).lean())!;
    expect(room.closedAt).not.toBeNull();
    expect(room.goals).toEqual([]);
    expect(await Message.countDocuments({ roomId })).toBe(0);
    expect(storage.deletedRooms).toContain(roomId);
    expect(countMembers(roomId)).toBe(0);
  });

  it('refuses joins afterwards and stops the timer', async () => {
    const { host, guests, roomId } = await roomWith(1);
    await emitAck(host.client, 'timer:start', { roomId });
    await emitAck(host.client, 'room:close', { roomId });

    expect(await emitAck(guests[0]!.client, 'room:join', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_CLOSED' },
    });
    expect(await emitAck(host.client, 'timer:pause', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    });
  });

  it('takes the card off the lobby', async () => {
    const { host, roomId } = await roomWith(0);
    const [watcher] = await server.connectUsers(1);
    await emitAck(watcher!.client, 'lobby:subscribe', {});
    const removed = new Promise<string>((resolve) =>
      watcher!.client.on('rooms:remove', (payload) => {
        if (payload.roomId === roomId) resolve(payload.roomId);
      }),
    );
    await emitAck(host.client, 'room:close', { roomId });
    expect(await removed).toBe(roomId);
  });

  it('cancels reconnect windows still open, so nothing happens when they would end', async () => {
    const { host, guests, roomId } = await roomWith(1);
    guests[0]!.client.disconnect();
    await pause(30);
    const onDepart = vi.spyOn(roomTimer, 'memberLeaving');
    await emitAck(host.client, 'room:close', { roomId });
    await pause(250);
    expect(onDepart).not.toHaveBeenCalled();
    expect(countMembers(roomId)).toBe(0);
  });
});
