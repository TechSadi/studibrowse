import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Room } from '../rooms/room.model';
import { createRoom } from '../rooms/rooms.service';
import { Session } from './session.model';

useTestDatabase();

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

const DAY = 86_400_000;

async function openRoom(hostId: string) {
  return createRoom(hostId, {
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
      autoStart: true,
    },
  });
}

function logSession(
  roomId: string,
  participants: [userId: string, focusedMins: number][],
  overrides: Record<string, unknown> = {},
) {
  return Session.create({
    roomId,
    roomName: 'Finals week focus',
    startedAt: new Date(),
    endedAt: new Date(),
    participants: participants.map(([userId, focusedMins]) => ({ userId, focusedMins })),
    goalsDone: 2,
    goalsTotal: 4,
    roundsCompleted: 2,
    ...overrides,
  });
}

function latest(token: string, query: Record<string, string | number>) {
  return request(app).get('/api/sessions/mine/latest').query(query).set('Authorization', `Bearer ${token}`);
}

describe('GET /api/sessions/mine/latest', () => {
  it('needs you to be logged in', async () => {
    const res = await request(app)
      .get('/api/sessions/mine/latest')
      .query({ roomId: new Types.ObjectId().toString() });
    expect(res.status).toBe(401);
  });

  it('rejects a bad room id or time', async () => {
    const { token } = await createUserWithToken();
    expect((await latest(token, { roomId: 'nope' })).body.error.code).toBe('VALIDATION_ERROR');
    const roomId = new Types.ObjectId().toString();
    expect((await latest(token, { roomId, since: 'soon' })).status).toBe(400);
  });

  it('is a 404 for a room that doesn’t exist', async () => {
    const { token } = await createUserWithToken();
    const res = await latest(token, { roomId: new Types.ObjectId().toString() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns your latest session in the room with your own minutes', async () => {
    const [{ user: maya, token }, { user: jordan }] = await Promise.all([
      createUserWithToken({ weeklyGoalMins: 720 }),
      createUserWithToken(),
    ]);
    const room = await openRoom(maya.id);
    // Seconds apart, so both are in this week whenever the test runs.
    await logSession(room.id, [[maya.id, 25]], { startedAt: new Date(Date.now() - 2_000) });
    const newest = await logSession(
      room.id,
      [
        [jordan.id, 100],
        [maya.id, 50],
      ],
      { startedAt: new Date(Date.now() - 1_000), endedAt: null, roundsCompleted: 1 },
    );

    const res = await latest(token, { roomId: room.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      session: {
        id: newest.id,
        roomName: 'Finals week focus',
        startedAt: newest.startedAt.toISOString(),
        endedAt: null,
        focusedMins: 50,
        roundsCompleted: 1,
        roundsTotal: null,
        goalsDone: 2,
        goalsTotal: 4,
        peopleCount: 2,
      },
      roomOpen: true,
      week: { focusMins: 75, goalMins: 720 },
      streakDays: 0,
    });
  });

  it('never returns someone else’s session, and still sums your week', async () => {
    const [{ user: maya, token }, { user: jordan }] = await Promise.all([
      createUserWithToken(),
      createUserWithToken(),
    ]);
    const room = await openRoom(maya.id);
    const other = await openRoom(maya.id);
    await logSession(room.id, [[jordan.id, 100]]);
    await logSession(other.id, [[maya.id, 40]]);

    const res = await latest(token, { roomId: room.id });
    expect(res.body.session).toBeNull();
    expect(res.body.week.focusMins).toBe(40);
  });

  it('leaves out a session last saved before `since`', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    const earlier = await logSession(room.id, [[user.id, 25]]);
    const lastVisit = new Date(Date.now() - 2 * 3_600_000);
    await Session.collection.updateOne({ _id: earlier._id }, { $set: { updatedAt: lastVisit } });

    expect((await latest(token, { roomId: room.id, since: Date.now() - 3_600_000 })).body.session).toBeNull();
    expect((await latest(token, { roomId: room.id, since: lastVisit.getTime() })).body.session.id).toBe(
      earlier.id,
    );
  });

  it('counts only this week toward the weekly goal', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    await logSession(room.id, [[user.id, 30]]);
    // The same weekday a week ago is always last week.
    await logSession(room.id, [[user.id, 200]], { startedAt: new Date(Date.now() - 7 * DAY) });

    expect((await latest(token, { roomId: room.id })).body.week.focusMins).toBe(30);
  });

  it('says when the room has closed', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    await Room.updateOne({ _id: room.id }, { closedAt: new Date() });
    expect((await latest(token, { roomId: room.id })).body.roomOpen).toBe(false);
  });

  it('shows your streak only if you studied today', async () => {
    const { user, token } = await createUserWithToken({
      streak: { current: 6, longest: 9 },
      lastStudiedAt: new Date(),
    });
    const room = await openRoom(user.id);
    expect((await latest(token, { roomId: room.id })).body.streakDays).toBe(6);

    const { user: lapsed, token: lapsedToken } = await createUserWithToken({
      streak: { current: 6, longest: 9 },
      lastStudiedAt: new Date(Date.now() - 2 * DAY),
    });
    const theirRoom = await openRoom(lapsed.id);
    expect((await latest(lapsedToken, { roomId: theirRoom.id })).body.streakDays).toBe(0);
  });
});

function history(token: string, query: Record<string, string | number> = {}) {
  return request(app).get('/api/sessions/mine').query(query).set('Authorization', `Bearer ${token}`);
}

const ids = (res: { body: { sessions: { id: string }[] } }) => res.body.sessions.map((session) => session.id);

describe('GET /api/sessions/mine', () => {
  it('needs you to be logged in', async () => {
    expect((await request(app).get('/api/sessions/mine')).status).toBe(401);
  });

  it('is empty for someone with no sessions', async () => {
    const { token } = await createUserWithToken();
    const res = await history(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessions: [], nextCursor: null });
  });

  it('lists your sessions with your own minutes, the people in them and the planned rounds', async () => {
    const [{ user: maya, token }, { user: jordan }] = await Promise.all([
      createUserWithToken(),
      createUserWithToken(),
    ]);
    const room = await openRoom(maya.id);
    const session = await logSession(
      room.id,
      [
        [jordan.id, 100],
        [maya.id, 50],
      ],
      { roundsTotal: 4 },
    );
    await logSession(room.id, [[jordan.id, 30]]);

    expect((await history(token)).body.sessions).toEqual([
      {
        id: session.id,
        roomName: 'Finals week focus',
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt!.toISOString(),
        focusedMins: 50,
        roundsCompleted: 2,
        roundsTotal: 4,
        goalsDone: 2,
        goalsTotal: 4,
        peopleCount: 2,
      },
    ]);
  });

  it('starts with sessions still in progress, then the rest by when they ended', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
    const endedEarly = await logSession(room.id, [[user.id, 25]], { startedAt: ago(10), endedAt: ago(9) });
    const endedLate = await logSession(room.id, [[user.id, 25]], { startedAt: ago(12), endedAt: ago(1) });
    const running = await logSession(room.id, [[user.id, 25]], { startedAt: ago(3), endedAt: null });

    expect(ids(await history(token))).toEqual([running.id, endedLate.id, endedEarly.id]);
  });

  it('pages through every session once, even when two ended at the same moment', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    const sameEnd = new Date(Date.now() - 3_600_000);
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(
        await logSession(room.id, [[user.id, 25]], {
          endedAt: i < 3 ? sameEnd : new Date(Date.now() - i * DAY),
        }),
      );
    }
    created.push(await logSession(room.id, [[user.id, 25]], { endedAt: null }));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await history(token, cursor ? { limit: 2, cursor } : { limit: 2 });
      expect(res.status).toBe(200);
      expect(res.body.sessions.length).toBeLessThanOrEqual(2);
      seen.push(...ids(res));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(6);
    expect(seen.sort()).toEqual(created.map((session) => session.id).sort());
  });

  it('moves on to finished sessions after a first page full of ones in progress', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    const running = await logSession(room.id, [[user.id, 25]], { endedAt: null });
    const finished = await logSession(room.id, [[user.id, 25]]);

    const first = await history(token, { limit: 1 });
    expect(ids(first)).toEqual([running.id]);
    const second = await history(token, { limit: 1, cursor: first.body.nextCursor });
    expect(ids(second)).toEqual([finished.id]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('never lists sessions you weren’t in', async () => {
    const [{ token }, { user: jordan }] = await Promise.all([createUserWithToken(), createUserWithToken()]);
    const room = await openRoom(jordan.id);
    await logSession(room.id, [[jordan.id, 100]]);
    await logSession(room.id, [[jordan.id, 100]], { endedAt: null });
    expect((await history(token)).body.sessions).toEqual([]);
  });

  it('rejects a cursor it didn’t make and a page that’s too big', async () => {
    const { token } = await createUserWithToken();
    const bad = await history(token, { cursor: 'not-a-cursor' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect((await history(token, { limit: 500 })).status).toBe(400);
  });
});
