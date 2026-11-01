import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { INVITE_CODE_PATTERN, type CreateRoomInput, type RoomSummary } from '@studibrowse/shared';
import { createApp } from '../../app';
import { addMember, resetPresence } from '../../realtime/presence';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { User } from '../users/user.model';
import { Room } from './room.model';

useTestDatabase();
afterEach(resetPresence);

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

const timerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};

function roomInput(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return {
    name: 'Finals week focus',
    subject: 'Maths',
    isPublic: true,
    maxSize: 10,
    timerSettings,
    ...overrides,
  };
}

function createRoom(token: string, body: object = roomInput()) {
  return request(app).post('/api/rooms').set('Authorization', `Bearer ${token}`).send(body);
}

async function createRoomOk(token: string, overrides: Partial<CreateRoomInput> = {}) {
  const res = await createRoom(token, roomInput(overrides));
  expect(res.status).toBe(201);
  return res.body.room as { id: string; inviteCode: string };
}

function listPublic(token: string, query: Record<string, string | number | undefined> = {}) {
  return request(app).get('/api/rooms/public').query(query).set('Authorization', `Bearer ${token}`);
}

function names(rooms: RoomSummary[]) {
  return rooms.map((room) => room.name);
}

function follow(token: string, id: string) {
  return request(app).post(`/api/users/${id}/follow`).set('Authorization', `Bearer ${token}`);
}

describe('POST /api/rooms', () => {
  it('creates a room with the creator as host', async () => {
    const { user, token } = await createUserWithToken();
    const res = await createRoom(token, roomInput({ goals: [' Finish chapter 4 '], maxSize: 20 }));

    expect(res.status).toBe(201);
    expect(res.body.room).toMatchObject({
      name: 'Finals week focus',
      subject: 'Maths',
      description: '',
      isPublic: true,
      maxSize: 20,
      isHost: true,
      memberCount: 0,
      host: { id: user.id, name: user.name, username: user.username },
      goals: [{ text: 'Finish chapter 4', done: false, addedBy: user.id }],
      timerSettings,
      timer: { phase: 'focus', round: 1, endsAt: null, pausedRemaining: 25 * 60_000 },
      totalSessions: 0,
      totalFocusMins: 0,
    });
    expect(res.body.room.inviteCode).toMatch(INVITE_CODE_PATTERN);

    const saved = await Room.findById(res.body.room.id);
    expect(saved?.hostId.toString()).toBe(user.id);
    expect(saved?.emptySince).toBeInstanceOf(Date);
    expect(saved?.closedAt).toBeNull();
  });

  it('gives every room its own invite code', async () => {
    const { token } = await createUserWithToken();
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) codes.add((await createRoomOk(token)).inviteCode);
    expect(codes.size).toBe(5);
  });

  it('shows the host a private room’s invite code', async () => {
    const { token } = await createUserWithToken();
    const room = await createRoomOk(token, { isPublic: false });
    expect(room.inviteCode).toMatch(INVITE_CODE_PATTERN);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).post('/api/rooms').send(roomInput())).status).toBe(401);
  });

  it.each([
    ['a size of 1', { maxSize: 1 }],
    ['a size of 21', { maxSize: 21 }],
    ['a 4-minute focus', { timerSettings: { ...timerSettings, focusMins: 4 } }],
    ['a 95-minute focus', { timerSettings: { ...timerSettings, focusMins: 95 } }],
    ['a 31-minute short break', { timerSettings: { ...timerSettings, shortBreakMins: 31 } }],
    ['13 rounds', { timerSettings: { ...timerSettings, totalRounds: 13 } }],
    ['11 goals', { goals: Array.from({ length: 11 }, (_, i) => `Goal ${i}`) }],
    ['an empty name', { name: ' ' }],
    ['a host id', { hostId: '6650f0c2a1b2c3d4e5f60718' }],
    ['an invite code', { inviteCode: 'aaaaaaaaaa' }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_, change) => {
    const { token } = await createUserWithToken();
    const res = await createRoom(token, { ...roomInput(), ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await Room.countDocuments()).toBe(0);
  });
});

describe('GET /api/rooms/public', () => {
  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/rooms/public')).status).toBe(401);
  });

  it('returns an empty list when nothing is live', async () => {
    const { token } = await createUserWithToken();
    const res = await listPublic(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rooms: [], nextPage: null });
  });

  it('lists public rooms as cards, without invite codes or goals', async () => {
    const { user, token } = await createUserWithToken();
    await createRoomOk(token, { name: 'Open study' });
    const [card] = (await listPublic(token)).body.rooms;
    expect(card).toMatchObject({
      name: 'Open study',
      subject: 'Maths',
      maxSize: 10,
      memberCount: 0,
      hostFollowed: false,
      host: { id: user.id },
    });
    expect(Object.keys(card).sort()).toEqual(
      [
        'host',
        'hostFollowed',
        'id',
        'isPublic',
        'maxSize',
        'memberCount',
        'name',
        'subject',
        'timer',
        'timerSettings',
      ].sort(),
    );
  });

  describe('private rooms never appear', () => {
    it('not to their host, to strangers, or to followers of the host', async () => {
      const { user: host, token: hostToken } = await createUserWithToken();
      const { token: strangerToken } = await createUserWithToken();
      const { token: followerToken } = await createUserWithToken();
      await follow(followerToken, host.id);
      await createRoomOk(hostToken, { name: 'Public room' });
      await createRoomOk(hostToken, { name: 'Secret room', isPublic: false });

      for (const token of [hostToken, strangerToken, followerToken]) {
        expect(names((await listPublic(token)).body.rooms)).toEqual(['Public room']);
      }
    });

    it('under any search, subject or filter', async () => {
      const { token } = await createUserWithToken();
      await createRoomOk(token, { name: 'Secret exam grind', subject: 'Law', isPublic: false });
      await Room.updateOne(
        { name: 'Secret exam grind' },
        { timer: { phase: 'focus', round: 1, endsAt: new Date(Date.now() + 60_000), pausedRemaining: null } },
      );

      const queries = [
        {},
        { q: 'secret' },
        { q: 'Law' },
        { subject: 'law' },
        { filter: 'open' },
        { filter: 'focus' },
        { filter: 'break' },
      ];
      for (const query of queries) {
        expect((await listPublic(token, query)).body.rooms).toEqual([]);
      }
    });

    it('on any page', async () => {
      const { token } = await createUserWithToken();
      for (let i = 0; i < 12; i++) await createRoomOk(token, { name: `Public ${i}` });
      for (let i = 0; i < 12; i++) await createRoomOk(token, { name: `Private ${i}`, isPublic: false });

      const first = (await listPublic(token)).body;
      const second = (await listPublic(token, { page: first.nextPage })).body;
      const all = [...names(first.rooms), ...names(second.rooms)];
      expect(all).toHaveLength(12);
      expect(all.every((name) => name.startsWith('Public'))).toBe(true);
      expect(second.nextPage).toBeNull();
    });
  });

  it('leaves out closed rooms and rooms whose host is gone', async () => {
    const { token } = await createUserWithToken();
    const { user: gone, token: goneToken } = await createUserWithToken();
    const closed = await createRoomOk(token, { name: 'Closed' });
    await createRoomOk(token, { name: 'Open' });
    await createRoomOk(goneToken, { name: 'Orphan' });
    await Room.updateOne({ _id: closed.id }, { closedAt: new Date() });
    await User.deleteOne({ _id: gone.id });

    expect(names((await listPublic(token)).body.rooms)).toEqual(['Open']);
  });

  it('lists rooms hosted by people you follow first, then newest', async () => {
    const { token } = await createUserWithToken();
    const { user: maya, token: mayaToken } = await createUserWithToken({ name: 'Maya Kapoor' });
    const { token: jordanToken } = await createUserWithToken({ name: 'Jordan Lee' });
    await createRoomOk(mayaToken, { name: 'Maya old' });
    await createRoomOk(jordanToken, { name: 'Jordan old' });
    await createRoomOk(mayaToken, { name: 'Maya new' });
    await createRoomOk(jordanToken, { name: 'Jordan new' });
    await follow(token, maya.id);

    const { rooms } = (await listPublic(token)).body;
    expect(names(rooms)).toEqual(['Maya new', 'Maya old', 'Jordan new', 'Jordan old']);
    expect(rooms.map((room: RoomSummary) => room.hostFollowed)).toEqual([true, true, false, false]);
  });

  it('pages 9 rooms at a time', async () => {
    const { token } = await createUserWithToken();
    for (let i = 0; i < 10; i++) await createRoomOk(token, { name: `Room ${i}` });

    const first = (await listPublic(token)).body;
    expect(first.rooms).toHaveLength(9);
    expect(first.nextPage).toBe(2);

    const second = (await listPublic(token, { page: 2 })).body;
    expect(names(second.rooms)).toEqual(['Room 0']);
    expect(second.nextPage).toBeNull();
  });

  it('filters by subject, ignoring case', async () => {
    const { token } = await createUserWithToken();
    await createRoomOk(token, { name: 'Torts', subject: 'Law' });
    await createRoomOk(token, { name: 'Calculus', subject: 'Maths' });
    await createRoomOk(token, { name: 'Lawn care', subject: 'Lawns' });

    expect(names((await listPublic(token, { subject: 'LAW' })).body.rooms)).toEqual(['Torts']);
  });

  it('searches names and subjects, treating the search as plain text', async () => {
    const { token } = await createUserWithToken();
    await createRoomOk(token, { name: 'Late-night exam grind', subject: 'Medicine' });
    await createRoomOk(token, { name: 'Quiet reading', subject: 'Exam prep' });
    await createRoomOk(token, { name: 'Calculus', subject: 'Maths' });

    expect(names((await listPublic(token, { q: 'EXAM' })).body.rooms)).toEqual([
      'Quiet reading',
      'Late-night exam grind',
    ]);
    expect((await listPublic(token, { q: '.*' })).body.rooms).toEqual([]);
  });

  it('filters by phase, counting only running timers', async () => {
    const { token } = await createUserWithToken();
    const focus = await createRoomOk(token, { name: 'Focusing' });
    const shortBreak = await createRoomOk(token, { name: 'Short break' });
    const longBreak = await createRoomOk(token, { name: 'Long break' });
    await createRoomOk(token, { name: 'Not started' });
    const endsAt = new Date(Date.now() + 60_000);
    const running = (phase: string) => ({ timer: { phase, round: 1, endsAt, pausedRemaining: null } });
    await Room.updateOne({ _id: focus.id }, running('focus'));
    await Room.updateOne({ _id: shortBreak.id }, running('shortBreak'));
    await Room.updateOne({ _id: longBreak.id }, running('longBreak'));

    expect(names((await listPublic(token, { filter: 'focus' })).body.rooms)).toEqual(['Focusing']);
    expect(names((await listPublic(token, { filter: 'break' })).body.rooms)).toEqual([
      'Long break',
      'Short break',
    ]);
  });

  it('reports member counts and leaves full rooms out of "Has space"', async () => {
    const { token } = await createUserWithToken();
    const full = await createRoomOk(token, { name: 'Full', maxSize: 2 });
    await createRoomOk(token, { name: 'Roomy', maxSize: 2 });
    addMember(full.id, 'a', 2);
    addMember(full.id, 'b', 2);

    const all = (await listPublic(token)).body.rooms as RoomSummary[];
    expect(all.find((room) => room.name === 'Full')?.memberCount).toBe(2);
    expect(names((await listPublic(token, { filter: 'open' })).body.rooms)).toEqual(['Roomy']);
  });

  it.each([{ page: 0 }, { filter: 'full' }])('rejects %o with 400 VALIDATION_ERROR', async (query) => {
    const { token } = await createUserWithToken();
    const res = await listPublic(token, query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/rooms/:id', () => {
  function getRoom(token: string, id: string) {
    return request(app).get(`/api/rooms/${id}`).set('Authorization', `Bearer ${token}`);
  }

  it('needs a signed-in user', async () => {
    const { token } = await createUserWithToken();
    const room = await createRoomOk(token);
    expect((await request(app).get(`/api/rooms/${room.id}`)).status).toBe(401);
  });

  it('shows the host their room with its invite code', async () => {
    const { token } = await createUserWithToken();
    const room = await createRoomOk(token, { isPublic: false });
    const res = await getRoom(token, room.id);
    expect(res.status).toBe(200);
    expect(res.body.room).toMatchObject({ id: room.id, isHost: true, inviteCode: room.inviteCode });
  });

  it('shows anyone a public room with its invite code', async () => {
    const { token: hostToken } = await createUserWithToken();
    const { token } = await createUserWithToken();
    const room = await createRoomOk(hostToken);
    const res = await getRoom(token, room.id);
    expect(res.status).toBe(200);
    expect(res.body.room).toMatchObject({ isHost: false, inviteCode: room.inviteCode });
  });

  it('answers 404 ROOM_NOT_FOUND for someone else’s private room', async () => {
    const { token: hostToken } = await createUserWithToken();
    const { token } = await createUserWithToken();
    const room = await createRoomOk(hostToken, { isPublic: false });
    const res = await getRoom(token, room.id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain(room.inviteCode);
  });

  it('answers 404 for unknown and closed rooms', async () => {
    const { token } = await createUserWithToken();
    const room = await createRoomOk(token);
    await Room.updateOne({ _id: room.id }, { closedAt: new Date() });
    expect((await getRoom(token, room.id)).status).toBe(404);
    expect((await getRoom(token, '6650f0c2a1b2c3d4e5f60718')).status).toBe(404);
  });

  it('rejects a malformed id with 400 VALIDATION_ERROR', async () => {
    const { token } = await createUserWithToken();
    const res = await getRoom(token, 'not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/rooms/invite/:code', () => {
  function preview(code: string) {
    return request(app).get(`/api/rooms/invite/${code}`);
  }

  it('previews a room for someone signed out, with public data only', async () => {
    const { user, token } = await createUserWithToken({ name: 'Maya Kapoor' });
    const room = await createRoomOk(token, { isPublic: false, goals: ['Finish chapter 4'] });

    const res = await preview(room.inviteCode);
    expect(res.status).toBe(200);
    expect(res.body.room).toEqual({
      name: 'Finals week focus',
      subject: 'Maths',
      host: { id: user.id, name: 'Maya Kapoor', username: user.username, avatarColor: user.avatarColor },
      memberCount: 0,
      maxSize: 10,
      timer: { phase: 'focus', round: 1, endsAt: null, pausedRemaining: 25 * 60_000 },
      timerSettings,
      goals: [{ text: 'Finish chapter 4', done: false }],
    });
  });

  it('answers 404 ROOM_NOT_FOUND for an unknown code', async () => {
    const res = await preview('aaaaaaaaaa');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('answers 410 ROOM_CLOSED for a closed room', async () => {
    const { token } = await createUserWithToken();
    const room = await createRoomOk(token);
    await Room.updateOne({ _id: room.id }, { closedAt: new Date() });
    const res = await preview(room.inviteCode);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('ROOM_CLOSED');
  });

  it('rejects a malformed code with 400 VALIDATION_ERROR', async () => {
    const res = await preview('short');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
