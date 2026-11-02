import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NOTIFICATION_GROUP_WINDOW_MS,
  ROOM_FULL_GROUP_WINDOW_MS,
  type AppNotification,
  type NotificationPrefs,
} from '@studibrowse/shared';
import { addSocket, resetPresence } from '../../realtime/presence';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Room } from '../rooms/room.model';
import { createRoom } from '../rooms/rooms.service';
import type { UserDocument } from '../users/user.model';
import { Notification } from './notification.model';
import { canSeeRoom, createNotificationSender, type NotificationSender } from './notifications.service';

useTestDatabase();

const START = new Date('2026-11-02T10:00:00Z');
let nowMs = START.getTime();
let sent: { userId: string; notification: AppNotification }[] = [];
let sender: NotificationSender;

beforeEach(() => {
  nowMs = START.getTime();
  sent = [];
  sender = createNotificationSender({
    emit: (userId, notification) => sent.push({ userId, notification }),
    now: () => new Date(nowMs),
  });
});

afterEach(() => {
  resetPresence();
});

async function makeUser(prefs: Partial<NotificationPrefs> = {}, following: UserDocument[] = []) {
  const { user } = await createUserWithToken({
    notificationPrefs: { roomOpened: true, roomFull: true, memberJoined: true, roundEnded: true, ...prefs },
    following: following.map((u) => u._id),
  });
  return user;
}

async function openRoom(host: UserDocument, { isPublic = true, maxSize = 10 } = {}) {
  return createRoom(host.id, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic,
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

let socketCount = 0;

/** Puts someone in the room's presence, as room:join would. */
function enter(roomId: string, user: UserDocument, hostId: string, maxSize = 10) {
  socketCount += 1;
  return addSocket(roomId, `socket-${socketCount}`, {
    userId: user.id,
    profile: { name: user.name, username: user.username, avatarColor: user.avatarColor },
    status: 'focusing',
    maxSize,
    hostId,
    now: new Date(nowMs),
  });
}

const recipients = () => sent.map((entry) => entry.userId).sort();

describe('roomOpened: fan-out to followers', () => {
  it('saves and sends one notification to each follower of the host, and nobody else', async () => {
    const host = await makeUser();
    const followerA = await makeUser({}, [host]);
    const followerB = await makeUser({}, [host]);
    await makeUser(); // follows nobody
    const room = await openRoom(host);

    await sender.roomOpened(room.id);

    expect(recipients()).toEqual([followerA.id, followerB.id].sort());
    expect(sent[0]!.notification).toMatchObject({
      type: 'roomStarted',
      roomId: room.id,
      roomName: 'Finals week focus',
      text: `${host.name} opened a room`,
      read: false,
    });
    const saved = await Notification.find({ type: 'roomStarted' }).lean();
    expect(saved.map((doc) => doc.userId.toString()).sort()).toEqual([followerA.id, followerB.id].sort());
    // What was sent is what was saved.
    expect(saved.map((doc) => doc._id.toString())).toContain(sent[0]!.notification.id);
  });

  it('skips followers who switched off "someone I follow opened a room"', async () => {
    const host = await makeUser();
    const keen = await makeUser({}, [host]);
    await makeUser({ roomOpened: false }, [host]);
    await sender.roomOpened((await openRoom(host)).id);

    expect(recipients()).toEqual([keen.id]);
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('never tells anyone about a private room', async () => {
    const host = await makeUser();
    await makeUser({}, [host]);
    await sender.roomOpened((await openRoom(host, { isPublic: false })).id);

    expect(sent).toEqual([]);
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('says nothing about a room that has already closed', async () => {
    const host = await makeUser();
    await makeUser({}, [host]);
    const room = await openRoom(host);
    await Room.updateOne({ _id: room.id }, { closedAt: new Date(nowMs) });

    await sender.roomOpened(room.id);
    expect(sent).toEqual([]);
  });
});

describe('memberJoined', () => {
  it('tells the current host, not the person joining', async () => {
    const host = await makeUser();
    const guest = await makeUser();
    const room = await openRoom(host);
    enter(room.id, host, host.id);
    enter(room.id, guest, host.id);

    await sender.memberJoined(room.id, guest.id);

    expect(recipients()).toEqual([host.id]);
    expect(sent[0]!.notification.text).toBe(`${guest.name} joined your room`);
  });

  it('says nothing when the host joins their own room', async () => {
    const host = await makeUser();
    const room = await openRoom(host);
    enter(room.id, host, host.id);
    await sender.memberJoined(room.id, host.id);
    expect(sent).toEqual([]);
  });

  it('respects the host’s preference', async () => {
    const host = await makeUser({ memberJoined: false });
    const guest = await makeUser();
    const room = await openRoom(host);
    enter(room.id, host, host.id);
    enter(room.id, guest, host.id);
    await sender.memberJoined(room.id, guest.id);
    expect(sent).toEqual([]);
  });

  it('groups 5 joins within a minute into one notification', async () => {
    const host = await makeUser();
    const guests = await Promise.all(Array.from({ length: 5 }, () => makeUser()));
    const room = await openRoom(host);
    enter(room.id, host, host.id);

    for (const guest of guests) {
      enter(room.id, guest, host.id);
      await sender.memberJoined(room.id, guest.id);
      nowMs += 10_000;
    }

    expect(await Notification.countDocuments({ type: 'memberJoined' })).toBe(1);
    // Sent each time it grew, always with the same id, so the bell replaces it.
    expect(new Set(sent.map((entry) => entry.notification.id)).size).toBe(1);
    expect(sent).toHaveLength(5);
    expect(sent.at(-1)!.notification.text).toBe(`${guests[0]!.name} and 4 others joined your room`);
  });

  it('does not count someone twice when they come back inside the window', async () => {
    const host = await makeUser();
    const guest = await makeUser();
    const room = await openRoom(host);
    enter(room.id, host, host.id);
    enter(room.id, guest, host.id);
    await sender.memberJoined(room.id, guest.id);
    await sender.memberJoined(room.id, guest.id);

    expect(sent).toHaveLength(1);
    expect((await Notification.findOne().lean())!.text).toBe(`${guest.name} joined your room`);
  });

  it('starts a new notification after the window, or once the last one was read', async () => {
    const host = await makeUser();
    const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const room = await openRoom(host);
    enter(room.id, host, host.id);

    await sender.memberJoined(room.id, a.id);
    nowMs += NOTIFICATION_GROUP_WINDOW_MS + 1;
    await sender.memberJoined(room.id, b.id);
    expect(await Notification.countDocuments()).toBe(2);

    await Notification.updateMany({}, { read: true });
    await sender.memberJoined(room.id, c.id);
    expect(await Notification.countDocuments()).toBe(3);
  });
});

describe('roomFull', () => {
  it('tells the host only once the room reaches its size', async () => {
    const host = await makeUser();
    const guest = await makeUser();
    const room = await openRoom(host, { maxSize: 2 });
    enter(room.id, host, host.id, 2);

    await sender.roomFull(room.id);
    expect(sent).toEqual([]);

    enter(room.id, guest, host.id, 2);
    await sender.roomFull(room.id);
    expect(recipients()).toEqual([host.id]);
    expect(sent[0]!.notification).toMatchObject({ type: 'roomFull', text: 'Your room is full' });
  });

  it('does not repeat itself while the room flickers between full and not', async () => {
    const host = await makeUser();
    const guest = await makeUser();
    const room = await openRoom(host, { maxSize: 2 });
    enter(room.id, host, host.id, 2);
    enter(room.id, guest, host.id, 2);

    await sender.roomFull(room.id);
    nowMs += ROOM_FULL_GROUP_WINDOW_MS - 1;
    await sender.roomFull(room.id);
    expect(sent).toHaveLength(1);

    nowMs += 2;
    await sender.roomFull(room.id);
    expect(sent).toHaveLength(2);
  });

  it('respects the host’s preference', async () => {
    const host = await makeUser({ roomFull: false });
    const guest = await makeUser();
    const room = await openRoom(host, { maxSize: 2 });
    enter(room.id, host, host.id, 2);
    enter(room.id, guest, host.id, 2);
    await sender.roomFull(room.id);
    expect(sent).toEqual([]);
  });
});

describe('roundEnded', () => {
  it('tells everyone in the room who wants to know, and nobody outside it', async () => {
    const host = await makeUser();
    const keen = await makeUser();
    const quiet = await makeUser({ roundEnded: false });
    await makeUser(); // not in the room
    const room = await openRoom(host, { isPublic: false });
    for (const user of [host, keen, quiet]) enter(room.id, user, host.id);

    await sender.roundEnded(room.id, 2);

    expect(recipients()).toEqual([host.id, keen.id].sort());
    expect(sent[0]!.notification).toMatchObject({ type: 'roundEnded', text: 'Round 2 complete' });
  });
});

describe('canSeeRoom', () => {
  it('lets anyone see a public room, and only the host and members see a private one', async () => {
    const host = await makeUser();
    const member = await makeUser();
    const outsider = await makeUser();
    const privateRoom = await openRoom(host, { isPublic: false });
    enter(privateRoom.id, host, host.id);
    enter(privateRoom.id, member, host.id);
    const record = {
      _id: new Types.ObjectId(privateRoom.id),
      name: privateRoom.name,
      hostId: host._id,
      isPublic: false,
      maxSize: 10,
    };

    expect(canSeeRoom(host.id, record)).toBe(true);
    expect(canSeeRoom(member.id, record)).toBe(true);
    expect(canSeeRoom(outsider.id, record)).toBe(false);
    expect(canSeeRoom(outsider.id, { ...record, isPublic: true })).toBe(true);
  });
});
