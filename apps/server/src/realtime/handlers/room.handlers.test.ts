import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PresenceMember } from '@studibrowse/shared';
import { Message } from '../../modules/chat/message.model';
import { Resource } from '../../modules/resources/resource.model';
import { Room } from '../../modules/rooms/room.model';
import { createRoom } from '../../modules/rooms/rooms.service';
import { createUserWithToken } from '../../test/authHelpers';
import {
  emitAck,
  nextEvent,
  startSocketServer,
  type ConnectedUser,
  type TestClient,
  type TestSocketServer,
} from '../../test/socketHelpers';
import { useTestDatabase } from '../../test/testDb';
import { countMembers, isMember, resetPresence } from '../presence';
import { createRoomHandlers } from './room.handlers';

useTestDatabase();

const RECONNECT_GRACE_MS = 200;
const roomHandlers = createRoomHandlers({ reconnectGraceMs: RECONNECT_GRACE_MS });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({ registerHandlers: [roomHandlers.register] });
});

afterEach(() => {
  roomHandlers.dispose();
  resetPresence();
});

afterAll(async () => {
  await server.close();
});

const timerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: false,
};

async function openRoom(hostId: string, { isPublic = true, maxSize = 10, goals = [] as string[] } = {}) {
  return createRoom(hostId, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic,
    maxSize,
    goals,
    timerSettings,
  });
}

async function connectUser(): Promise<ConnectedUser> {
  const [connected] = await server.connectUsers(1);
  return connected!;
}

const userIds = (members: PresenceMember[]) => members.map((member) => member.userId);

function join(client: TestClient, roomId: string, inviteCode?: string) {
  return emitAck(client, 'room:join', inviteCode ? { roomId, inviteCode } : { roomId });
}

async function joinOk(client: TestClient, roomId: string, inviteCode?: string) {
  const ack = await join(client, roomId, inviteCode);
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
  return ack.data;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('room:join', () => {
  it('answers with the full room snapshot and tells the room', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id, { goals: ['Finish chapter 4'] });
    const resource = await Resource.create({
      roomId: room.id,
      userId: host.user.id,
      type: 'link',
      title: 'Notes',
      url: 'https://example.com/notes',
    });
    const base = Date.now() - 60_000;
    await Message.insertMany(
      Array.from({ length: 55 }, (_, i) => ({
        roomId: room.id,
        userId: host.user.id,
        text: `message ${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    );
    await joinOk(host.client, room.id);
    await emitAck(host.client, 'status:set', { roomId: room.id, workingOn: 'Chapter 4' });

    const guest = await connectUser();
    const heard = nextEvent(host.client, 'presence:update');
    const data = await joinOk(guest.client, room.id);

    expect(data.room).toMatchObject({
      id: room.id,
      name: 'Finals week focus',
      isHost: false,
      memberCount: 2,
      timer: { phase: 'focus', round: 1, endsAt: null, pausedRemaining: 25 * 60_000 },
      goals: [expect.objectContaining({ text: 'Finish chapter 4', done: false })],
    });
    expect(data.members).toEqual([
      expect.objectContaining({
        userId: host.user.id,
        isHost: true,
        status: 'focusing',
        workingOn: 'Chapter 4',
      }),
      expect.objectContaining({ userId: guest.user.id, isHost: false, status: 'focusing', workingOn: '' }),
    ]);
    expect(data.resources).toEqual([
      expect.objectContaining({ id: resource.id, title: 'Notes', size: null }),
    ]);
    expect(data.messages).toHaveLength(50);
    expect(data.messages[0]?.text).toBe('message 5');
    expect(data.messages.at(-1)?.text).toBe('message 54');

    expect(userIds((await heard).members)).toEqual([host.user.id, guest.user.id]);
    expect((await Room.findById(room.id).lean())?.emptySince).toBeNull();
  });

  it('rejects a room that does not exist or has closed', async () => {
    const { user, client } = await connectUser();
    expect(await join(client, new Types.ObjectId().toString())).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });

    const room = await openRoom(user.id);
    await Room.updateOne({ _id: room.id }, { closedAt: new Date() });
    expect(await join(client, room.id)).toMatchObject({ ok: false, error: { code: 'ROOM_CLOSED' } });
  });

  it('rejects a new person once the room is full, counting people rather than tabs', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id, { maxSize: 2 });
    const guest = await connectUser();
    await joinOk(host.client, room.id);
    await joinOk(guest.client, room.id);

    // A second tab of someone already in doesn't take a seat.
    const guestTab = await server.connectWithToken(guest.token);
    expect((await joinOk(guestTab, room.id)).members).toHaveLength(2);

    const late = await connectUser();
    expect(await join(late.client, room.id)).toEqual({
      ok: false,
      error: { code: 'ROOM_FULL', message: expect.any(String) as unknown },
    });
    expect(isMember(room.id, late.user.id)).toBe(false);
  });

  it('needs the invite code for a private room, except for its host', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id, { isPublic: false });
    const guest = await connectUser();

    expect(await join(guest.client, room.id)).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    expect(await join(guest.client, room.id, 'wrongcode0')).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });

    await joinOk(host.client, room.id);
    const data = await joinOk(guest.client, room.id, room.inviteCode!);
    expect(data.room.inviteCode).toBeNull();
    expect(userIds(data.members)).toEqual([host.user.id, guest.user.id]);
  });
});

describe('status:set', () => {
  it('changes your status and note and tells the room', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id);
    await joinOk(host.client, room.id);

    const heard = nextEvent(host.client, 'presence:update');
    expect(
      await emitAck(host.client, 'status:set', { roomId: room.id, status: 'away', workingOn: 'Essay' }),
    ).toEqual({ ok: true, data: {} });
    expect((await heard).members[0]).toMatchObject({
      status: 'away',
      workingOn: 'Essay',
      focusingSince: null,
    });
  });

  it('is only for people in the room', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id);
    const ack = await emitAck(host.client, 'status:set', { roomId: room.id, status: 'away' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
  });
});

describe('room:leave', () => {
  it('removes you straight away and starts the grace period when the room empties', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id);
    const guest = await connectUser();
    await joinOk(host.client, room.id);
    await joinOk(guest.client, room.id);

    const heard = nextEvent(host.client, 'presence:update');
    expect(await emitAck(guest.client, 'room:leave', { roomId: room.id })).toEqual({ ok: true, data: {} });
    expect(userIds((await heard).members)).toEqual([host.user.id]);

    await emitAck(host.client, 'room:leave', { roomId: room.id });
    expect(countMembers(room.id)).toBe(0);
    expect((await Room.findById(room.id).lean())?.emptySince).toBeInstanceOf(Date);
  });

  it('is only for people in the room', async () => {
    const { user, client } = await connectUser();
    const room = await openRoom(user.id);
    expect(await emitAck(client, 'room:leave', { roomId: room.id })).toMatchObject({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    });
  });

  it('keeps you in while another of your tabs is still there', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id);
    const secondTab = await server.connectWithToken(host.token);
    await joinOk(host.client, room.id);
    await joinOk(secondTab, room.id);

    await emitAck(host.client, 'room:leave', { roomId: room.id });
    expect(isMember(room.id, host.user.id)).toBe(true);
  });
});

describe('host handover', () => {
  it('passes the host role to whoever has been in the room longest', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id);
    const first = await connectUser();
    const second = await connectUser();
    await joinOk(host.client, room.id);
    await joinOk(first.client, room.id);
    await joinOk(second.client, room.id);

    const heard = nextEvent(second.client, 'presence:update');
    await emitAck(host.client, 'room:leave', { roomId: room.id });

    const { members } = await heard;
    expect(members.map(({ userId, isHost }) => [userId, isHost])).toEqual([
      [first.user.id, true],
      [second.user.id, false],
    ]);
    await vi.waitFor(async () =>
      expect((await Room.findById(room.id).lean())?.hostId.toString()).toBe(first.user.id),
    );
  });

  it('also happens when the host’s reconnect window runs out', async () => {
    const host = await connectUser();
    const room = await openRoom(host.user.id);
    const guest = await connectUser();
    await joinOk(host.client, room.id);
    await joinOk(guest.client, room.id);

    const heard = nextEvent(guest.client, 'presence:update', 2000);
    host.client.disconnect();

    expect((await heard).members).toEqual([expect.objectContaining({ userId: guest.user.id, isHost: true })]);
  });
});

describe('reconnect window', () => {
  it('keeps your place if you come back in time', async () => {
    const { user, token, client } = await createUserWithToken().then(async (created) => ({
      ...created,
      client: await server.connectWithToken(created.token),
    }));
    const room = await openRoom(user.id);
    const watcher = await connectUser();
    const first = await joinOk(client, room.id);
    await joinOk(watcher.client, room.id);
    const heard = vi.fn();
    watcher.client.on('presence:update', heard);

    client.disconnect();
    await pause(RECONNECT_GRACE_MS / 2);
    // Nobody announces you as gone while you might come back.
    expect(heard).not.toHaveBeenCalled();
    expect(isMember(room.id, user.id)).toBe(true);

    const back = await joinOk(await server.connectWithToken(token), room.id);
    await pause(RECONNECT_GRACE_MS);

    const me = back.members.find((member) => member.userId === user.id);
    expect(me?.joinedAt).toBe(first.members[0]?.joinedAt);
    expect(isMember(room.id, user.id)).toBe(true);
    // Only the rejoin's own update; no departure.
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('removes you once the window passes', async () => {
    const leaver = await connectUser();
    const room = await openRoom(leaver.user.id);
    const watcher = await connectUser();
    await joinOk(leaver.client, room.id);
    await joinOk(watcher.client, room.id);

    const heard = nextEvent(watcher.client, 'presence:update');
    leaver.client.disconnect();

    expect(userIds((await heard).members)).toEqual([watcher.user.id]);
    expect(isMember(room.id, leaver.user.id)).toBe(false);
  });

  it('starts the room’s grace period as soon as the last socket drops, and a rejoin clears it', async () => {
    const { user, token, client } = await createUserWithToken().then(async (created) => ({
      ...created,
      client: await server.connectWithToken(created.token),
    }));
    const room = await openRoom(user.id);
    await joinOk(client, room.id);
    expect((await Room.findById(room.id).lean())?.emptySince).toBeNull();

    client.disconnect();
    await vi.waitFor(async () =>
      expect((await Room.findById(room.id).lean())?.emptySince).toBeInstanceOf(Date),
    );

    await joinOk(await server.connectWithToken(token), room.id);
    expect((await Room.findById(room.id).lean())?.emptySince).toBeNull();
  });
});
