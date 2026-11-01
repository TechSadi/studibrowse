import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ROOM_GRACE_MS,
  type CreateRoomResponse,
  type LobbyRoomCard,
  type ServerToClientEvents,
  type TimerSettings,
} from '@studibrowse/shared';
import { closeEmptyRooms } from '../../jobs/roomCleanup';
import { createFakeStorage } from '../../test/fakeStorage';
import {
  emitAck,
  startSocketServer,
  type ConnectedUser,
  type TestClient,
  type TestSocketServer,
} from '../../test/socketHelpers';
import { useTestDatabase } from '../../test/testDb';
import { broadcastRoomCard, LOBBY_COALESCE_MS, resetLobby } from '../lobby';
import { resetPresence } from '../presence';
import { createRoomTimer } from '../roomTimer';
import { createLobbyHandlers } from './lobby.handlers';
import { createRoomHandlers } from './room.handlers';
import { createSettingsHandlers } from './settings.handlers';
import { createTimerHandlers } from './timer.handlers';

useTestDatabase();

const RECONNECT_GRACE_MS = 200;
const roomTimer = createRoomTimer();
const roomHandlers = createRoomHandlers({ reconnectGraceMs: RECONNECT_GRACE_MS });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({
    registerHandlers: [
      roomHandlers.register,
      createSettingsHandlers(),
      createTimerHandlers(roomTimer),
      createLobbyHandlers(),
    ],
  });
});

afterEach(() => {
  roomHandlers.dispose();
  roomTimer.dispose();
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

type LobbyEvent = { event: 'rooms:upsert'; room: LobbyRoomCard } | { event: 'rooms:remove'; roomId: string };

/** Everything the lobby sends `client`, in order. `next` waits for the first event after `from` that matches. */
function recordLobby(client: TestClient) {
  const events: LobbyEvent[] = [];
  const waiters = new Set<() => void>();
  const notify = () => waiters.forEach((waiter) => waiter());
  const onUpsert: ServerToClientEvents['rooms:upsert'] = ({ room }) => {
    events.push({ event: 'rooms:upsert', room });
    notify();
  };
  const onRemove: ServerToClientEvents['rooms:remove'] = ({ roomId }) => {
    events.push({ event: 'rooms:remove', roomId });
    notify();
  };
  client.on('rooms:upsert', onUpsert);
  client.on('rooms:remove', onRemove);

  function next(match: (event: LobbyEvent) => boolean, ms = LOBBY_COALESCE_MS * 3): Promise<LobbyEvent> {
    const from = events.length;
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = events.slice(from).find(match);
        if (!found) return;
        waiters.delete(check);
        clearTimeout(timer);
        resolve(found);
      };
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`No matching lobby event within ${ms} ms`));
      }, ms);
      waiters.add(check);
    });
  }

  return { events, next };
}

const upsertOf =
  (roomId: string, fields: Partial<LobbyRoomCard> = {}) =>
  (event: LobbyEvent) =>
    event.event === 'rooms:upsert' &&
    event.room.id === roomId &&
    Object.entries(fields).every(([key, value]) => event.room[key as keyof LobbyRoomCard] === value);

const removeOf = (roomId: string) => (event: LobbyEvent) =>
  event.event === 'rooms:remove' && event.roomId === roomId;

/** Creates a room over REST, as the web app does, so the lobby hears about it from the real route. */
async function createRoomOverRest(member: ConnectedUser, { isPublic = true } = {}): Promise<string> {
  const res = await fetch(`${server.url}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({
      name: 'Finals week focus',
      subject: 'Maths',
      description: '',
      isPublic,
      maxSize: 10,
      goals: [],
      timerSettings,
    }),
  });
  if (res.status !== 201) throw new Error(`POST /api/rooms failed: ${res.status}`);
  return ((await res.json()) as CreateRoomResponse).room.id;
}

async function join(member: ConnectedUser, roomId: string): Promise<void> {
  const ack = await emitAck(member.client, 'room:join', { roomId });
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
}

async function leave(member: ConnectedUser, roomId: string): Promise<void> {
  const ack = await emitAck(member.client, 'room:leave', { roomId });
  if (!ack.ok) throw new Error(`room:leave failed: ${ack.error.code}`);
}

/** A watcher on Home (subscribed to the lobby) and `others` people who make rooms and join them. */
async function lobbyWith(others: number) {
  const [watcher, ...people] = await server.connectUsers(others + 1);
  expect(await emitAck(watcher!.client, 'lobby:subscribe', {})).toEqual({ ok: true, data: {} });
  return { watcher: watcher!, lobby: recordLobby(watcher!.client), people };
}

/** Closes every room that has emptied, as the cleanup job would after the grace period. */
async function runCleanup(): Promise<void> {
  const closed = await closeEmptyRooms(createFakeStorage(), new Date(Date.now() + ROOM_GRACE_MS + 1000));
  // What index.ts's onClosed does.
  for (const roomId of closed) broadcastRoomCard(server.io, roomId);
}

describe('lobby:subscribe', () => {
  it('sends a new public room’s card to the lobby', async () => {
    const { lobby, people } = await lobbyWith(1);
    const [host] = people;

    const created = lobby.next(() => true);
    const roomId = await createRoomOverRest(host!);

    const event = await created;
    expect(event).toEqual({
      event: 'rooms:upsert',
      room: expect.objectContaining({
        id: roomId,
        name: 'Finals week focus',
        subject: 'Maths',
        host: expect.objectContaining({ id: host!.user.id, name: host!.user.name }) as unknown,
        memberCount: 0,
        maxSize: 10,
        isLive: false,
        timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
      }) as unknown,
    });
    expect(event.event === 'rooms:upsert' && 'hostFollowed' in event.room).toBe(false);
  });

  it('updates the member count as people join and leave', async () => {
    const { lobby, people } = await lobbyWith(2);
    const [host, guest] = people;
    const roomId = await createRoomOverRest(host!);
    await lobby.next(upsertOf(roomId, { memberCount: 0 }));

    const one = lobby.next(upsertOf(roomId, { memberCount: 1, isLive: true }));
    await join(host!, roomId);
    await one;

    const two = lobby.next(upsertOf(roomId, { memberCount: 2 }));
    await join(guest!, roomId);
    await two;

    const back = lobby.next(upsertOf(roomId, { memberCount: 1 }));
    await leave(guest!, roomId);
    await back;
  });

  it('folds quick changes into at most one card per second', async () => {
    const { lobby, people } = await lobbyWith(3);
    const [host, ...guests] = people;
    const roomId = await createRoomOverRest(host!);
    await lobby.next(upsertOf(roomId));
    const before = lobby.events.length;

    const last = lobby.next(upsertOf(roomId, { memberCount: 3 }));
    for (const member of [host!, ...guests]) await join(member, roomId);
    await last;

    // Three joins straight after the create's card: all of them arrive together in one trailing card.
    expect(lobby.events.slice(before)).toHaveLength(1);
  });

  it('counts someone who dropped until their reconnect window ends', async () => {
    const { lobby, people } = await lobbyWith(2);
    const [host, guest] = people;
    const roomId = await createRoomOverRest(host!);
    await join(host!, roomId);
    await join(guest!, roomId);
    await lobby.next(upsertOf(roomId, { memberCount: 2 }));

    const dropped = lobby.next(upsertOf(roomId, { memberCount: 1 }));
    const droppedAt = Date.now();
    guest!.client.disconnect();
    await dropped;

    expect(Date.now() - droppedAt).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS);
  });

  it('sends the new phase when the host starts the timer', async () => {
    const { lobby, people } = await lobbyWith(1);
    const [host] = people;
    const roomId = await createRoomOverRest(host!);
    await join(host!, roomId);
    await lobby.next(upsertOf(roomId, { memberCount: 1 }));

    const started = lobby.next(
      (event) =>
        upsertOf(roomId)(event) && event.event === 'rooms:upsert' && event.room.timer.phase === 'focus',
    );
    expect((await emitAck(host!.client, 'timer:start', { roomId })).ok).toBe(true);

    const event = await started;
    expect(event.event === 'rooms:upsert' && event.room.timer.endsAt).toEqual(expect.any(String));
  });

  it('sends rooms:remove when a room closes', async () => {
    const { lobby, people } = await lobbyWith(1);
    const [host] = people;
    const roomId = await createRoomOverRest(host!);
    await join(host!, roomId);
    await leave(host!, roomId);

    const removed = lobby.next(removeOf(roomId));
    await runCleanup();
    await removed;
  });

  it('sends rooms:remove when the host makes the room private', async () => {
    const { lobby, people } = await lobbyWith(1);
    const [host] = people;
    const roomId = await createRoomOverRest(host!);
    await join(host!, roomId);

    const removed = lobby.next(removeOf(roomId));
    const ack = await emitAck(host!.client, 'room:settings', {
      roomId,
      name: 'Finals week focus',
      subject: 'Maths',
      isPublic: false,
      maxSize: 10,
      timerSettings,
    });
    expect(ack.ok).toBe(true);
    await removed;

    // Changes after that stay out of the lobby.
    await emitAck(host!.client, 'timer:start', { roomId });
    await new Promise((resolve) => setTimeout(resolve, LOBBY_COALESCE_MS * 1.5));
    expect(lobby.events.at(-1)).toEqual({ event: 'rooms:remove', roomId });
  });

  it('never sends anything about a private room', async () => {
    const { lobby, people } = await lobbyWith(2);
    const [host, guest] = people;
    const roomId = await createRoomOverRest(host!, { isPublic: false });
    const { room } = (await (
      await fetch(`${server.url}/api/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${host!.token}` },
      })
    ).json()) as CreateRoomResponse;

    await join(host!, roomId);
    const guestAck = await emitAck(guest!.client, 'room:join', { roomId, inviteCode: room.inviteCode! });
    expect(guestAck.ok).toBe(true);
    await emitAck(host!.client, 'timer:start', { roomId });
    await emitAck(host!.client, 'room:settings', {
      roomId,
      name: 'Renamed',
      subject: 'Maths',
      isPublic: false,
      maxSize: 10,
      timerSettings,
    });
    await leave(guest!, roomId);
    await leave(host!, roomId);
    await runCleanup();
    await new Promise((resolve) => setTimeout(resolve, LOBBY_COALESCE_MS * 1.5));

    expect(lobby.events).toEqual([]);
  });

  it('stops sending after lobby:unsubscribe', async () => {
    const { watcher, lobby, people } = await lobbyWith(1);
    expect(await emitAck(watcher.client, 'lobby:unsubscribe', {})).toEqual({ ok: true, data: {} });

    const roomId = await createRoomOverRest(people[0]!);
    await join(people[0]!, roomId);
    await new Promise((resolve) => setTimeout(resolve, LOBBY_COALESCE_MS * 1.5));

    expect(lobby.events).toEqual([]);
  });

  it('only reaches sockets that subscribed', async () => {
    const { lobby, people } = await lobbyWith(2);
    const [host, bystander] = people;
    const bystanderEvents = recordLobby(bystander!.client);

    const roomId = await createRoomOverRest(host!);
    await lobby.next(upsertOf(roomId));

    expect(bystanderEvents.events).toEqual([]);
  });
});
