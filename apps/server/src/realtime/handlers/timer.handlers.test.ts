import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TimerSettings } from '@studibrowse/shared';
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
import { listMembers, resetPresence } from '../presence';
import { createRoomTimer } from '../roomTimer';
import { createRoomHandlers } from './room.handlers';
import { createTimerHandlers } from './timer.handlers';

useTestDatabase();

const MIN = 60_000;

// The room timer's clock runs `skewMs` ahead of the real one, so a test can let minutes "pass" instantly.
let skewMs = 0;
const roomHandlers = createRoomHandlers({ reconnectGraceMs: 200 });
const roomTimer = createRoomTimer({ now: () => new Date(Date.now() + skewMs) });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({
    registerHandlers: [roomHandlers.register, createTimerHandlers(roomTimer)],
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

async function openRoom(hostId: string, settings: Partial<TimerSettings> = {}) {
  return createRoom(hostId, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic: true,
    maxSize: 10,
    goals: [],
    timerSettings: { ...timerSettings, ...settings },
  });
}

async function joinOk(client: TestClient, roomId: string) {
  const ack = await emitAck(client, 'room:join', { roomId });
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
  return ack.data;
}

/** A host and `guests` others, all in one room. */
async function roomWith(guests: number, settings: Partial<TimerSettings> = {}) {
  const [host, ...others] = await server.connectUsers(guests + 1);
  const room = await openRoom(host!.user.id, settings);
  for (const member of [host!, ...others]) await joinOk(member.client, room.id);
  return { host: host!, guests: others, roomId: room.id };
}

async function command(
  member: ConnectedUser,
  roomId: string,
  event: `timer:${'start' | 'pause' | 'skip' | 'reset'}`,
) {
  const heard = nextEvent(member.client, 'timer:state');
  const ack = await emitAck(member.client, event, { roomId });
  expect(ack).toEqual({ ok: true, data: {} });
  return heard;
}

const storedRoom = async (roomId: string) => (await Room.findById(roomId).lean())!;

describe('timer commands', () => {
  it('starts the timer and gives everyone in the room the same endsAt', async () => {
    const { host, guests, roomId } = await roomWith(2);
    const clients = [host, ...guests].map((member) => member.client);
    const heard = clients.map((client) => nextEvent(client, 'timer:state'));
    const statuses = nextEvent(guests[0]!.client, 'presence:update');

    const before = Date.now();
    expect(await emitAck(host.client, 'timer:start', { roomId })).toEqual({ ok: true, data: {} });
    const states = await Promise.all(heard);

    const { endsAt } = states[0]!.timer;
    expect(endsAt).not.toBeNull();
    for (const state of states) {
      expect(state).toEqual({
        roomId,
        timer: { phase: 'focus', round: 1, endsAt, pausedRemaining: null },
        serverNow: expect.any(Number) as unknown,
      });
    }
    const endsAtMs = Date.parse(endsAt!);
    expect(endsAtMs).toBeGreaterThanOrEqual(before + 25 * MIN);
    expect(endsAtMs).toBeLessThanOrEqual(Date.now() + 25 * MIN);
    expect(states[0]!.serverNow).toBeGreaterThanOrEqual(before);

    // Saved, so a restart or a late joiner sees the same timer.
    const stored = await storedRoom(roomId);
    expect(stored.timer).toMatchObject({ phase: 'focus', round: 1, pausedRemaining: null });
    expect(stored.timer.endsAt?.toISOString()).toBe(endsAt);
    expect(stored.run?.startedAt).toBeInstanceOf(Date);

    // Everyone moves to Focusing with the phase.
    expect((await statuses).members.map((member) => member.status)).toEqual([
      'focusing',
      'focusing',
      'focusing',
    ]);
  });

  it('refuses a timer command from anyone but the host', async () => {
    const { guests, roomId } = await roomWith(1);
    const guest = guests[0]!;
    const noBroadcast = nextEvent(guest.client, 'timer:state', 300);

    expect(await emitAck(guest.client, 'timer:start', { roomId })).toEqual({
      ok: false,
      error: { code: 'NOT_HOST', message: 'Only the host can control the timer.' },
    });
    await expect(noBroadcast).rejects.toThrow('No timer:state');
    expect((await storedRoom(roomId)).timer).toMatchObject({ phase: 'idle', endsAt: null });
  });

  it('refuses someone who has not joined the room', async () => {
    const { roomId } = await roomWith(0);
    const [outsider] = await server.connectUsers(1);
    expect(await emitAck(outsider!.client, 'timer:start', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    });
  });

  it('gives a late joiner the running timer and the server clock', async () => {
    const { host, roomId } = await roomWith(1);
    const { timer } = await command(host, roomId, 'timer:start');

    const [late] = await server.connectUsers(1);
    const before = Date.now();
    const data = await joinOk(late!.client, roomId);

    expect(data.room.timer).toEqual(timer);
    expect(data.serverNow).toBeGreaterThanOrEqual(before);
    expect(data.serverNow).toBeLessThanOrEqual(Date.now());
    // The phase is focus, so they arrive Focusing.
    expect(data.members.find((member) => member.userId === late!.user.id)?.status).toBe('focusing');
  });

  it('pauses, resumes with start, skips and resets', async () => {
    const { host, roomId } = await roomWith(1);
    await command(host, roomId, 'timer:start');

    skewMs = 10 * MIN;
    const paused = await command(host, roomId, 'timer:pause');
    expect(paused.timer).toMatchObject({ phase: 'focus', endsAt: null });
    expect(paused.timer.pausedRemaining).toBeGreaterThan(14 * MIN);
    expect(paused.timer.pausedRemaining).toBeLessThanOrEqual(15 * MIN);

    const resumed = await command(host, roomId, 'timer:start');
    expect(resumed.timer).toMatchObject({ phase: 'focus', round: 1, pausedRemaining: null });
    // serverNow is read as the state goes out, a moment after endsAt was worked out.
    const leftAfterResume = Date.parse(resumed.timer.endsAt!) - resumed.serverNow;
    expect(leftAfterResume).toBeLessThanOrEqual(paused.timer.pausedRemaining!);
    expect(leftAfterResume).toBeGreaterThan(paused.timer.pausedRemaining! - 1000);

    const statuses = nextEvent(host.client, 'presence:update');
    const skipped = await command(host, roomId, 'timer:skip');
    // autoStart is off, so the break waits at full length for the host.
    expect(skipped.timer).toEqual({ phase: 'shortBreak', round: 1, endsAt: null, pausedRemaining: 5 * MIN });
    expect((await statuses).members.map((member) => member.status)).toEqual(['break', 'break']);

    const reset = await command(host, roomId, 'timer:reset');
    expect(reset.timer).toEqual({ phase: 'idle', round: 1, endsAt: null, pausedRemaining: null });
    expect((await storedRoom(roomId)).timer).toMatchObject({ phase: 'idle', endsAt: null });
  });

  it('credits each Focusing member when the host skips a focus phase', async () => {
    const { host, guests, roomId } = await roomWith(2);
    await command(host, roomId, 'timer:start');
    await emitAck(guests[1]!.client, 'status:set', { roomId, status: 'away' });

    skewMs = 10 * MIN;
    await command(host, roomId, 'timer:skip');

    const focus = (await storedRoom(roomId)).run!.focus.map(({ userId, focusedMs }) => ({
      userId: userId.toString(),
      focusedMs,
    }));
    expect(focus.map((credit) => credit.userId).sort()).toEqual([host.user.id, guests[0]!.user.id].sort());
    for (const credit of focus) {
      // Ten skewed minutes plus the few real milliseconds the test took.
      expect(credit.focusedMs).toBeGreaterThanOrEqual(10 * MIN);
      expect(credit.focusedMs).toBeLessThan(10 * MIN + 1000);
    }
  });

  it('answers INVALID_TIMER_COMMAND for a command that does not fit the timer', async () => {
    const { host, roomId } = await roomWith(0);
    expect(await emitAck(host.client, 'timer:pause', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TIMER_COMMAND' },
    });
  });

  it('refuses commands once the room has closed', async () => {
    const { host, roomId } = await roomWith(0);
    await Room.updateOne({ _id: roomId }, { closedAt: new Date() });
    expect(await emitAck(host.client, 'timer:start', { roomId })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_CLOSED' },
    });
  });
});

describe('phase changes', () => {
  it('advances when endsAt passes, credits focus and moves everyone to Break', async () => {
    const [host] = await server.connectUsers(1);
    const room = await openRoom(host!.user.id);
    const endsAt = new Date(Date.now() + 150);
    await Room.updateOne(
      { _id: room.id },
      { timer: { phase: 'focus', round: 1, endsAt, pausedRemaining: null } },
    );
    // Joining during focus starts them Focusing.
    await joinOk(host!.client, room.id);

    const heard = nextEvent(host!.client, 'timer:state');
    const statuses = nextEvent(host!.client, 'presence:update');
    await roomTimer.restore(server.io);

    expect((await heard).timer).toEqual({
      phase: 'shortBreak',
      round: 1,
      endsAt: null,
      pausedRemaining: 5 * MIN,
    });
    expect((await statuses).members[0]).toMatchObject({ status: 'break', focusingSince: null });
    const stored = await storedRoom(room.id);
    expect(stored.timer).toMatchObject({ phase: 'shortBreak', endsAt: null, pausedRemaining: 5 * MIN });
    expect(stored.run!.focus).toHaveLength(1);
    expect(stored.run!.focus[0]!.userId.toString()).toBe(host!.user.id);
    expect(stored.run!.focus[0]!.focusedMs).toBeGreaterThan(0);
    expect(stored.run!.focus[0]!.focusedMs).toBeLessThan(1000);
  });

  it('catches up after a restart through every phase that ended while it was down', async () => {
    const [host] = await server.connectUsers(1);
    const room = await openRoom(host!.user.id, { autoStart: true });
    const endedAt = new Date(Date.now() - 31 * MIN);
    await Room.updateOne(
      { _id: room.id },
      { timer: { phase: 'focus', round: 1, endsAt: endedAt, pausedRemaining: null } },
    );

    await roomTimer.restore(server.io);

    // focus 1 → break (5) → focus 2 (25) → break 2, which ends 35 minutes after the first focus did.
    await vi.waitFor(async () => {
      expect((await storedRoom(room.id)).timer).toEqual({
        phase: 'shortBreak',
        round: 2,
        endsAt: new Date(endedAt.getTime() + 35 * MIN),
        pausedRemaining: null,
      });
    });
    expect(listMembers(room.id)).toEqual([]);
  });

  it('replaces a room’s scheduled timeout when it is rescheduled', async () => {
    const { host, roomId } = await roomWith(0, { autoStart: true });
    const started = await command(host, roomId, 'timer:start');
    // Pretend the focus phase is about to end.
    const endsAt = new Date(Date.now() + 100);
    await Room.updateOne({ _id: roomId }, { 'timer.endsAt': endsAt });
    await roomTimer.restore(server.io);

    const next = await nextEvent(host.client, 'timer:state');
    expect(started.timer.phase).toBe('focus');
    expect(next.timer).toEqual({
      phase: 'shortBreak',
      round: 1,
      endsAt: new Date(endsAt.getTime() + 5 * MIN).toISOString(),
      pausedRemaining: null,
    });
  });
});
