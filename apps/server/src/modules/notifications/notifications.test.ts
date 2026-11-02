import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { NotificationsResponse, NotificationType } from '@studibrowse/shared';
import { createApp } from '../../app';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Room } from '../rooms/room.model';
import { createRoom } from '../rooms/rooms.service';
import { Notification } from './notification.model';

useTestDatabase();

const app = createApp({ isDatabaseConnected: () => true, clientOrigin: 'http://localhost:5173' });

const START = Date.parse('2026-11-02T10:00:00Z');

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
      autoStart: false,
    },
  });
}

/** Saves a notification `minutesAgo` before START. */
function notify(
  userId: string,
  roomId: string,
  minutesAgo: number,
  overrides: { type?: NotificationType; read?: boolean } = {},
) {
  const at = new Date(START - minutesAgo * 60_000);
  return Notification.create({
    userId,
    type: overrides.type ?? 'roomStarted',
    roomId,
    roomName: 'Finals week focus',
    text: `Notification from ${minutesAgo} min ago`,
    read: overrides.read ?? false,
    createdAt: at,
    groupStartedAt: at,
  });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function list(token: string, query: Record<string, string | number> = {}) {
  return request(app).get('/api/notifications').query(query).set(auth(token));
}

describe('GET /api/notifications', () => {
  it('needs you to be logged in', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('lists only your own, newest first, with whether each room is still open', async () => {
    const { user, token } = await createUserWithToken();
    const { user: other } = await createUserWithToken();
    const open = await openRoom(other.id);
    const closed = await openRoom(other.id);
    await Room.updateOne({ _id: closed.id }, { closedAt: new Date() });
    await notify(user.id, closed.id, 10);
    await notify(user.id, open.id, 1);
    await notify(other.id, open.id, 0);

    const res = await list(token);
    expect(res.status).toBe(200);
    const body = res.body as NotificationsResponse;
    expect(body.nextCursor).toBeNull();
    expect(body.notifications.map((n) => [n.roomId, n.roomOpen])).toEqual([
      [open.id, true],
      [closed.id, false],
    ]);
    expect(body.notifications[0]).toMatchObject({
      type: 'roomStarted',
      roomName: 'Finals week focus',
      read: false,
      createdAt: new Date(START - 60_000).toISOString(),
    });
    // Internal grouping fields stay on the server.
    expect(body.notifications[0]).not.toHaveProperty('actorIds');
  });

  it('filters to unread ones and to rooms opened', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    await notify(user.id, room.id, 3, { type: 'roomStarted', read: true });
    await notify(user.id, room.id, 2, { type: 'memberJoined' });
    await notify(user.id, room.id, 1, { type: 'roomStarted' });

    const unread = (await list(token, { filter: 'unread' })).body as NotificationsResponse;
    expect(unread.notifications.map((n) => n.text)).toEqual([
      'Notification from 1 min ago',
      'Notification from 2 min ago',
    ]);
    const rooms = (await list(token, { filter: 'rooms' })).body as NotificationsResponse;
    expect(rooms.notifications.map((n) => n.text)).toEqual([
      'Notification from 1 min ago',
      'Notification from 3 min ago',
    ]);
  });

  it('pages with a cursor, without repeating or skipping any', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    for (let i = 0; i < 5; i++) await notify(user.id, room.id, i);
    // Two at the same moment: the id breaks the tie.
    await notify(user.id, room.id, 2);

    const seen: string[] = [];
    let cursor: string | null | undefined;
    do {
      const res = await list(token, { limit: 2, ...(cursor ? { cursor } : {}) });
      const body = res.body as NotificationsResponse;
      seen.push(...body.notifications.map((n) => n.id));
      cursor = body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  it('rejects a bad filter or cursor in the standard error shape', async () => {
    const { token } = await createUserWithToken();
    const queries: Record<string, string>[] = [{ filter: 'muted' }, { cursor: 'not-ours' }];
    for (const query of queries) {
      const res = await list(token, query);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) as unknown },
      });
    }
  });
});

describe('unread count and marking read', () => {
  it('counts your unread ones', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    await notify(user.id, room.id, 1);
    await notify(user.id, room.id, 2, { read: true });

    const res = await request(app).get('/api/notifications/unread-count').set(auth(token));
    expect(res.body).toEqual({ count: 1 });
  });

  it('marks one as read and returns what is left', async () => {
    const { user, token } = await createUserWithToken();
    const room = await openRoom(user.id);
    const first = await notify(user.id, room.id, 1);
    await notify(user.id, room.id, 2);

    const res = await request(app).post('/api/notifications/read').set(auth(token)).send({ id: first.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1 });
    expect((await Notification.findById(first.id).lean())!.read).toBe(true);
  });

  it('marks all of yours as read, and nobody else’s', async () => {
    const { user, token } = await createUserWithToken();
    const { user: other } = await createUserWithToken();
    const room = await openRoom(user.id);
    await notify(user.id, room.id, 1);
    await notify(user.id, room.id, 2);
    await notify(other.id, room.id, 1);

    const res = await request(app).post('/api/notifications/read').set(auth(token)).send({ all: true });
    expect(res.body).toEqual({ count: 0 });
    expect(await Notification.countDocuments({ userId: other.id, read: false })).toBe(1);
  });

  it('answers someone else’s notification like a missing one', async () => {
    const { token } = await createUserWithToken();
    const { user: other } = await createUserWithToken();
    const room = await openRoom(other.id);
    const theirs = await notify(other.id, room.id, 1);

    for (const id of [theirs.id, new Types.ObjectId().toString()]) {
      const res = await request(app).post('/api/notifications/read').set(auth(token)).send({ id });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: 'NOTIFICATION_NOT_FOUND', message: expect.any(String) as unknown },
      });
    }
    expect((await Notification.findById(theirs.id).lean())!.read).toBe(false);
  });

  it('rejects a body that is neither an id nor all', async () => {
    const { token } = await createUserWithToken();
    const res = await request(app).post('/api/notifications/read').set(auth(token)).send({ all: false });
    expect(res.status).toBe(400);
  });
});
