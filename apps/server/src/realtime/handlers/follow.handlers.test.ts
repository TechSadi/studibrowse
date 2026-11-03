import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { CreateRoomResponse, FollowLive, TimerSettings } from '@studibrowse/shared';
import { User } from '../../modules/users/user.model';
import {
  emitAck,
  nextEvent,
  startSocketServer,
  type ConnectedUser,
  type TestSocketServer,
} from '../../test/socketHelpers';
import { useTestDatabase } from '../../test/testDb';
import { resetLobby } from '../lobby';
import { resetPresence } from '../presence';
import { createFollowHandlers } from './follow.handlers';
import { createRoomHandlers } from './room.handlers';
import { createSettingsHandlers } from './settings.handlers';

useTestDatabase();

const RECONNECT_GRACE_MS = 200;
const roomHandlers = createRoomHandlers({ reconnectGraceMs: RECONNECT_GRACE_MS });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({
    registerHandlers: [roomHandlers.register, createSettingsHandlers(), createFollowHandlers()],
  });
});

afterEach(() => {
  roomHandlers.dispose();
  resetLobby();
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

const roomFields = (isPublic: boolean) => ({
  name: 'Finals week focus',
  subject: 'Maths',
  description: '',
  isPublic,
  maxSize: 10,
  goals: [],
  timerSettings,
});

async function createRoom(member: ConnectedUser, { isPublic = true } = {}): Promise<string> {
  const res = await fetch(`${server.url}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify(roomFields(isPublic)),
  });
  if (res.status !== 201) throw new Error(`POST /api/rooms failed: ${res.status}`);
  return ((await res.json()) as CreateRoomResponse).room.id;
}

async function join(member: ConnectedUser, roomId: string): Promise<void> {
  const ack = await emitAck(member.client, 'room:join', { roomId });
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
}

async function follow(follower: ConnectedUser, followed: ConnectedUser): Promise<void> {
  await User.updateOne({ _id: follower.user._id }, { $addToSet: { following: followed.user._id } });
}

async function watch(member: ConnectedUser): Promise<FollowLive[]> {
  const ack = await emitAck(member.client, 'follows:watch', {});
  if (!ack.ok) throw new Error(`follows:watch failed: ${ack.error.code}`);
  return ack.data.live;
}

/** Fails if `member` gets a follows:live within `ms`. */
async function expectNoLive(member: ConnectedUser, ms = 300): Promise<void> {
  await expect(nextEvent(member.client, 'follows:live', ms)).rejects.toThrow();
}

describe('follows:watch', () => {
  it('answers where each person you follow is, public rooms only', async () => {
    const [watcher, inPublic, inPrivate, away] = await server.connectUsers(4);
    for (const person of [inPublic!, inPrivate!, away!]) await follow(watcher!, person);
    const publicRoom = await createRoom(inPublic!);
    await join(inPublic!, publicRoom);
    await join(inPrivate!, await createRoom(inPrivate!, { isPublic: false }));

    const live = await watch(watcher!);
    expect(live).toEqual([
      { userId: inPublic!.user.id, room: { id: publicRoom, name: 'Finals week focus', isHost: true } },
      { userId: inPrivate!.user.id, room: null },
      { userId: away!.user.id, room: null },
    ]);
  });

  it('rejects a payload with fields', async () => {
    const [watcher] = await server.connectUsers(1);
    const ack = await emitAck(watcher!.client, 'follows:watch', { userIds: ['x'] } as never);
    expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('follows:live', () => {
  it('tells followers when someone joins a public room and when they leave it', async () => {
    const [watcher, host, guest] = await server.connectUsers(3);
    await follow(watcher!, guest!);
    await watch(watcher!);
    const roomId = await createRoom(host!);
    await join(host!, roomId);

    const joined = nextEvent(watcher!.client, 'follows:live');
    await join(guest!, roomId);
    expect(await joined).toEqual({
      userId: guest!.user.id,
      room: { id: roomId, name: 'Finals week focus', isHost: false },
    });

    const left = nextEvent(watcher!.client, 'follows:live');
    await emitAck(guest!.client, 'room:leave', { roomId });
    expect(await left).toEqual({ userId: guest!.user.id, room: null });
  });

  it('clears the dot once the reconnect window runs out after a dropped connection', async () => {
    const [watcher, host] = await server.connectUsers(2);
    await follow(watcher!, host!);
    await watch(watcher!);
    const roomId = await createRoom(host!);
    const joined = nextEvent(watcher!.client, 'follows:live');
    await join(host!, roomId);
    await joined;

    const gone = nextEvent(watcher!.client, 'follows:live', RECONNECT_GRACE_MS + 2000);
    host!.client.disconnect();
    expect(await gone).toEqual({ userId: host!.user.id, room: null });
  });

  it('says nothing about a private room', async () => {
    const [watcher, host] = await server.connectUsers(2);
    await follow(watcher!, host!);
    await watch(watcher!);
    const roomId = await createRoom(host!, { isPublic: false });

    const live = nextEvent(watcher!.client, 'follows:live');
    await join(host!, roomId);
    expect(await live).toEqual({ userId: host!.user.id, room: null });
  });

  it('clears the dot when the room goes private', async () => {
    const [watcher, host] = await server.connectUsers(2);
    await follow(watcher!, host!);
    await watch(watcher!);
    const roomId = await createRoom(host!);
    const joined = nextEvent(watcher!.client, 'follows:live');
    await join(host!, roomId);
    expect((await joined).room).not.toBeNull();

    const hidden = nextEvent(watcher!.client, 'follows:live');
    const ack = await emitAck(host!.client, 'room:settings', { roomId, ...roomFields(false) });
    expect(ack.ok).toBe(true);
    expect(await hidden).toEqual({ userId: host!.user.id, room: null });
  });

  it('reaches only the people who follow them', async () => {
    const [stranger, host] = await server.connectUsers(2);
    await watch(stranger!);
    const roomId = await createRoom(host!);
    await join(host!, roomId);
    await expectNoLive(stranger!);
  });

  it('stops after an unfollow once the client watches again', async () => {
    const [watcher, host] = await server.connectUsers(2);
    await follow(watcher!, host!);
    await watch(watcher!);
    await User.updateOne({ _id: watcher!.user._id }, { $pull: { following: host!.user._id } });
    expect(await watch(watcher!)).toEqual([]);

    await join(host!, await createRoom(host!));
    await expectNoLive(watcher!);
  });
});
