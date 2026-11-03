import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createNotificationSender } from '../modules/notifications/notifications.service';
import { createRoom } from '../modules/rooms/rooms.service';
import { emitAck, nextEvent, startSocketServer, type TestSocketServer } from '../test/socketHelpers';
import { useTestDatabase } from '../test/testDb';
import { createRoomHandlers } from './handlers/room.handlers';
import { createTimerHandlers } from './handlers/timer.handlers';
import { resetPresence } from './presence';
import { createRoomTimer } from './roomTimer';
import { userRoom } from './types';

useTestDatabase();

// Built before the server exists; `emit` only runs once it does.
let server: TestSocketServer;
const sender = createNotificationSender({
  emit: (userId, notification) => server.io.to(userRoom(userId)).emit('notification:new', { notification }),
});
const roomTimer = createRoomTimer({ onRoundEnded: sender.roundEnded });
const roomHandlers = createRoomHandlers({
  onDepart: roomTimer.memberLeaving,
  onJoined: async (roomId, userId) => {
    await sender.memberJoined(roomId, userId);
    await sender.roomFull(roomId);
  },
});

beforeAll(async () => {
  server = await startSocketServer({
    registerHandlers: [roomHandlers.register, createTimerHandlers(roomTimer)],
  });
});

afterEach(() => {
  roomHandlers.dispose();
  roomTimer.dispose();
  resetPresence();
});

afterAll(async () => {
  await server.close();
});

async function openRoom(hostId: string, maxSize = 10) {
  return createRoom(hostId, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic: true,
    maxSize,
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

describe('notification:new over the socket', () => {
  it('reaches the host when someone joins, and the room filling up', async () => {
    const [host, guest] = await server.connectUsers(2);
    const room = await openRoom(host!.user.id, 2);
    expect((await emitAck(host!.client, 'room:join', { roomId: room.id })).ok).toBe(true);

    const heard: string[] = [];
    const both = new Promise<void>((resolve) => {
      host!.client.on('notification:new', ({ notification }) => {
        heard.push(notification.type);
        if (heard.length === 2) resolve();
      });
    });
    const guestHeard = vi.fn();
    guest!.client.on('notification:new', guestHeard);

    expect((await emitAck(guest!.client, 'room:join', { roomId: room.id })).ok).toBe(true);
    await both;
    expect(heard).toEqual(['memberJoined', 'roomFull']);
    expect(guestHeard).not.toHaveBeenCalled();
  });

  it('reaches everyone in the room once when a focus round ends', async () => {
    const [host, guest] = await server.connectUsers(2);
    const room = await openRoom(host!.user.id);
    await emitAck(host!.client, 'room:join', { roomId: room.id });
    // The host hears about the guest joining first, so that isn't mistaken for the round's.
    const joined = nextEvent(host!.client, 'notification:new');
    await emitAck(guest!.client, 'room:join', { roomId: room.id });
    expect((await joined).notification.type).toBe('memberJoined');

    await emitAck(host!.client, 'timer:start', { roomId: room.id });
    const forHost = nextEvent(host!.client, 'notification:new');
    const forGuest = nextEvent(guest!.client, 'notification:new');
    await emitAck(host!.client, 'timer:skip', { roomId: room.id });

    for (const { notification } of await Promise.all([forHost, forGuest])) {
      expect(notification).toMatchObject({ type: 'roundEnded', roomId: room.id, text: 'Round 1 complete' });
    }
  });
});
