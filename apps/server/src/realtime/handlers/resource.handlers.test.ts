import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, type ClientPayload, type ServerToClientEvents } from '@studibrowse/shared';
import { Resource } from '../../modules/resources/resource.model';
import { Room } from '../../modules/rooms/room.model';
import { createRoom } from '../../modules/rooms/rooms.service';
import { createFakeStorage } from '../../test/fakeStorage';
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
import { createResourceHandlers } from './resource.handlers';
import { createRoomHandlers } from './room.handlers';

useTestDatabase();

const storage = createFakeStorage();
const roomHandlers = createRoomHandlers({ reconnectGraceMs: 200 });
let server: TestSocketServer;

beforeAll(async () => {
  server = await startSocketServer({
    registerHandlers: [roomHandlers.register, createResourceHandlers(storage)],
  });
});

afterEach(() => {
  roomHandlers.dispose();
  resetPresence();
  storage.deletedFiles.length = 0;
});

afterAll(async () => {
  await server.close();
});

async function joinOk(client: TestClient, roomId: string) {
  const ack = await emitAck(client, 'room:join', { roomId });
  if (!ack.ok) throw new Error(`room:join failed: ${ack.error.code}`);
}

/** `members` people in one room. The first is the host. */
async function roomWith(members: number): Promise<{ people: ConnectedUser[]; roomId: string }> {
  const people = await server.connectUsers(members);
  const room = await createRoom(people[0]!.user.id, {
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

const link = (roomId: string) =>
  ({ roomId, type: 'link', title: '  Past exam papers ', url: 'https://example.com/papers' }) as const;

function file(roomId: string, url: string, overrides: { size?: number; fileName?: string } = {}) {
  return {
    roomId,
    type: 'file',
    title: 'Formula sheet',
    url,
    size: 2048,
    fileName: 'formulas.pdf',
    ...overrides,
  } as const;
}

describe('resource:add', () => {
  it('saves a link and sends it to everyone in the room', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const heard = [nextEvent(alice.client, 'resource:new'), nextEvent(bob.client, 'resource:new')];

    const ack = await emitAck(bob.client, 'resource:add', link(roomId));

    const expected = {
      id: expect.any(String) as unknown,
      roomId,
      userId: bob.user.id,
      type: 'link',
      title: 'Past exam papers',
      url: 'https://example.com/papers',
      size: null,
      fileName: null,
      downloadUrl: null,
      thumbnailUrl: null,
      createdAt: expect.any(String) as unknown,
    };
    expect(ack).toEqual({ ok: true, data: { resource: expected } });
    for (const payload of await Promise.all(heard)) expect(payload).toEqual({ resource: expected });
    expect(await Resource.countDocuments({ roomId })).toBe(1);
  });

  it('refuses links that aren’t http(s)', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const silence = expectSilence(bob.client, 'resource:new', 300);

    for (const url of [
      'javascript:alert(1)',
      'ftp://example.com/notes.pdf',
      'data:text/html,hi',
      'not a url',
    ]) {
      const ack = await emitAck(alice.client, 'resource:add', { ...link(roomId), url });
      expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    }
    await silence;
    expect(await Resource.countDocuments({ roomId })).toBe(0);
  });

  it('shares an uploaded PDF with its real size, original name and download url', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const url = storage.put(roomId, { bytes: 1_800_000, format: 'pdf' });
    const heard = nextEvent(bob.client, 'resource:new');

    // The client's size is ignored: storage knows better.
    const ack = await emitAck(alice.client, 'resource:add', file(roomId, url, { size: 1 }));

    expect(ack.ok).toBe(true);
    expect((await heard).resource).toMatchObject({
      type: 'file',
      url,
      size: 1_800_000,
      fileName: 'formulas.pdf',
      downloadUrl: `${url}?download=formulas.pdf`,
      thumbnailUrl: null,
    });
  });

  it('gives images a thumbnail', async () => {
    const { people, roomId } = await roomWith(1);
    const url = storage.put(roomId, { bytes: 5000, format: 'png' });
    const ack = await emitAck(
      people[0]!.client,
      'resource:add',
      file(roomId, url, { fileName: 'board.png' }),
    );
    expect(ack.ok && ack.data.resource.thumbnailUrl).toBe(`${url}?thumb`);
  });

  it('refuses a url that isn’t one of this room’s uploads', async () => {
    const { people, roomId } = await roomWith(2);
    const other = await roomWith(1);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const silence = expectSilence(bob.client, 'resource:new', 300);

    const otherRoomsFile = storage.put(other.roomId, { bytes: 10, format: 'pdf' });
    for (const url of [
      'https://example.com/notes.pdf',
      otherRoomsFile,
      `${storage.put(roomId, { bytes: 1, format: 'pdf' })}x`,
    ]) {
      const ack = await emitAck(alice.client, 'resource:add', file(roomId, url));
      expect(ack).toMatchObject({ ok: false, error: { code: 'INVALID_FILE' } });
    }
    await silence;
    expect(await Resource.countDocuments({ roomId })).toBe(0);
    expect(storage.deletedFiles).toEqual([]);
  });

  it('refuses and deletes a stored file that is too large or of the wrong type', async () => {
    const { people, roomId } = await roomWith(1);
    const client = people[0]!.client;
    const huge = storage.put(roomId, { bytes: MAX_FILE_BYTES + 1, format: 'pdf' });
    const svg = storage.put(roomId, { bytes: 100, format: 'svg' });

    expect(await emitAck(client, 'resource:add', file(roomId, huge))).toMatchObject({
      ok: false,
      error: { code: 'FILE_TOO_LARGE' },
    });
    expect(await emitAck(client, 'resource:add', file(roomId, svg))).toMatchObject({
      ok: false,
      error: { code: 'FILE_TYPE_NOT_ALLOWED' },
    });
    expect(storage.deletedFiles).toEqual([huge, svg]);
    expect(await Resource.countDocuments({ roomId })).toBe(0);
  });

  it('accepts a file of exactly the size limit, once', async () => {
    const { people, roomId } = await roomWith(1);
    const client = people[0]!.client;
    const url = storage.put(roomId, { bytes: MAX_FILE_BYTES, format: 'jpg' });

    expect((await emitAck(client, 'resource:add', file(roomId, url))).ok).toBe(true);
    expect(await emitAck(client, 'resource:add', file(roomId, url))).toMatchObject({
      ok: false,
      error: { code: 'RESOURCE_EXISTS' },
    });
  });

  it('refuses someone who isn’t in the room', async () => {
    const { people, roomId } = await roomWith(1);
    const [outsider] = await server.connectUsers(1);
    const silence = expectSilence(people[0]!.client, 'resource:new');

    const ack = await emitAck(outsider!.client, 'resource:add', link(roomId));

    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
    await silence;
  });

  it('refuses once the room has closed', async () => {
    const { people, roomId } = await roomWith(1);
    await Room.updateOne({ _id: roomId }, { closedAt: new Date() });
    const ack = await emitAck(people[0]!.client, 'resource:add', link(roomId));
    expect(ack).toMatchObject({ ok: false, error: { code: 'ROOM_CLOSED' } });
  });
});

describe('resource:remove', () => {
  async function shared(client: TestClient, payload: ClientPayload<'resource:add'>) {
    const ack = await emitAck(client, 'resource:add', payload);
    if (!ack.ok) throw new Error(`resource:add failed: ${ack.error.code}`);
    return ack.data.resource;
  }

  it('lets whoever shared a file remove it, deletes it from storage and tells the room', async () => {
    const { people, roomId } = await roomWith(2);
    const [alice, bob] = people as [ConnectedUser, ConnectedUser];
    const url = storage.put(roomId, { bytes: 10, format: 'pdf' });
    const resource = await shared(bob.client, file(roomId, url));
    const heard = nextEvent(alice.client, 'resource:removed');

    const ack = await emitAck(bob.client, 'resource:remove', { roomId, resourceId: resource.id });

    expect(ack).toEqual({ ok: true, data: {} });
    expect(await heard).toEqual({ roomId, resourceId: resource.id });
    expect(await Resource.countDocuments({ roomId })).toBe(0);
    expect(storage.deletedFiles).toEqual([url]);
  });

  it('lets the host remove anyone’s link, without touching storage', async () => {
    const { people, roomId } = await roomWith(2);
    const [host, bob] = people as [ConnectedUser, ConnectedUser];
    const resource = await shared(bob.client, link(roomId));

    expect((await emitAck(host.client, 'resource:remove', { roomId, resourceId: resource.id })).ok).toBe(
      true,
    );
    expect(storage.deletedFiles).toEqual([]);
  });

  it('refuses anyone else, and resources that aren’t in the room', async () => {
    const { people, roomId } = await roomWith(3);
    const [host, bob, carol] = people as [ConnectedUser, ConnectedUser, ConnectedUser];
    const resource = await shared(host.client, link(roomId));
    const silence = expectSilence(host.client, 'resource:removed');

    expect(await emitAck(bob.client, 'resource:remove', { roomId, resourceId: resource.id })).toMatchObject({
      ok: false,
      error: { code: 'NOT_RESOURCE_AUTHOR' },
    });
    const missing = '64b7f0c2a1b2c3d4e5f60799';
    expect(await emitAck(carol.client, 'resource:remove', { roomId, resourceId: missing })).toMatchObject({
      ok: false,
      error: { code: 'RESOURCE_NOT_FOUND' },
    });
    await silence;
    expect(await Resource.countDocuments({ roomId })).toBe(1);
  });

  it('won’t remove another room’s resource through this room', async () => {
    const mine = await roomWith(1);
    const theirs = await roomWith(1);
    const resource = await shared(theirs.people[0]!.client, link(theirs.roomId));

    const ack = await emitAck(mine.people[0]!.client, 'resource:remove', {
      roomId: mine.roomId,
      resourceId: resource.id,
    });
    expect(ack).toMatchObject({ ok: false, error: { code: 'RESOURCE_NOT_FOUND' } });
  });
});
