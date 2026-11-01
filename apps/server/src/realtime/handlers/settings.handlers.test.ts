import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TimerSettings } from '@studibrowse/shared';
import { Room } from '../../modules/rooms/room.model';
import { createRoom } from '../../modules/rooms/rooms.service';
import { emitAck, nextEvent, startSocketServer, type TestSocketServer } from '../../test/socketHelpers';
import { useTestDatabase } from '../../test/testDb';
import { resetPresence } from '../presence';
import { createRoomHandlers } from './room.handlers';
import { createSettingsHandlers } from './settings.handlers';

useTestDatabase();

const roomHandlers = createRoomHandlers({ reconnectGraceMs: 200 });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({ registerHandlers: [roomHandlers.register, createSettingsHandlers()] });
});

afterEach(() => {
  roomHandlers.dispose();
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

/** A host and `guests` others, all in a room that starts with `goals`. */
async function roomWith(guests: number, goals: string[] = []) {
  const [host, ...others] = await server.connectUsers(guests + 1);
  const room = await createRoom(host!.user.id, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic: true,
    maxSize: 10,
    goals,
    timerSettings,
  });
  for (const member of [host!, ...others]) {
    const ack = await emitAck(member.client, 'room:join', { roomId: room.id });
    if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
  }
  return { host: host!, guests: others, roomId: room.id };
}

const settingsFor = (roomId: string, changes: Record<string, unknown> = {}) => ({
  roomId,
  name: 'Exam cram',
  subject: 'Physics',
  isPublic: false,
  maxSize: 6,
  timerSettings: { ...timerSettings, focusMins: 50 },
  ...changes,
});

describe('room:settings', () => {
  it('saves the host’s changes and sends them to everyone in the room', async () => {
    const { host, guests, roomId } = await roomWith(1);
    const heard = nextEvent(guests[0]!.client, 'room:update');

    expect(await emitAck(host.client, 'room:settings', settingsFor(roomId))).toEqual({ ok: true, data: {} });

    expect(await heard).toEqual({
      roomId,
      settings: {
        name: 'Exam cram',
        subject: 'Physics',
        description: '',
        isPublic: false,
        maxSize: 6,
        timerSettings: { ...timerSettings, focusMins: 50 },
      },
    });
    const stored = (await Room.findById(roomId).lean())!;
    expect(stored).toMatchObject({ name: 'Exam cram', isPublic: false, maxSize: 6 });
    expect(stored.timerSettings.focusMins).toBe(50);
  });

  it('keeps ticked goals that stay and broadcasts the new list', async () => {
    const { host, roomId } = await roomWith(0, ['Past paper', 'Flashcards']);
    await Room.updateOne({ _id: roomId }, { $set: { 'goals.0.done': true } });
    const kept = (await Room.findById(roomId).lean())!.goals[0]!;
    const heard = nextEvent(host.client, 'goal:update');

    await emitAck(
      host.client,
      'room:settings',
      settingsFor(roomId, { goals: ['Past paper', 'Summary notes'] }),
    );

    const { goals } = await heard;
    expect(goals).toEqual([
      { id: kept._id.toString(), text: 'Past paper', done: true, addedBy: kept.addedBy.toString() },
      { id: expect.any(String) as unknown, text: 'Summary notes', done: false, addedBy: host.user.id },
    ]);
  });

  it('refuses anyone but the host', async () => {
    const { guests, roomId } = await roomWith(1);
    const ack = await emitAck(guests[0]!.client, 'room:settings', settingsFor(roomId));
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect((await Room.findById(roomId).lean())!.name).toBe('Finals week focus');
  });

  it('refuses someone who hasn’t joined the room', async () => {
    const { roomId } = await roomWith(0);
    const [outsider] = await server.connectUsers(1);
    const ack = await emitAck(outsider!.client, 'room:settings', settingsFor(roomId));
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
  });

  it('won’t shrink the room below the people already in it', async () => {
    const { host, roomId } = await roomWith(2);
    const ack = await emitAck(host.client, 'room:settings', settingsFor(roomId, { maxSize: 2 }));
    expect(ack).toMatchObject({ ok: false, error: { code: 'ROOM_TOO_SMALL' } });
    expect((await Room.findById(roomId).lean())!.maxSize).toBe(10);
  });

  it('applies the new size to who can join', async () => {
    const { host, roomId } = await roomWith(1);
    await emitAck(host.client, 'room:settings', settingsFor(roomId, { maxSize: 2, isPublic: true }));
    const [late] = await server.connectUsers(1);
    const ack = await emitAck(late!.client, 'room:join', { roomId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
  });

  it('validates the payload', async () => {
    const { host, roomId } = await roomWith(0);
    const ack = await emitAck(host.client, 'room:settings', settingsFor(roomId, { name: '  ' }));
    expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});
