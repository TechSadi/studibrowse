import { afterEach, describe, expect, it } from 'vitest';
import { ROOM_GRACE_MS } from '@studibrowse/shared';
import { Message } from '../modules/chat/message.model';
import { Resource } from '../modules/resources/resource.model';
import { Room } from '../modules/rooms/room.model';
import { createRoom, getInvitePreview } from '../modules/rooms/rooms.service';
import { addSocket, resetPresence } from '../realtime/presence';
import { createUserWithToken } from '../test/authHelpers';
import { useTestDatabase } from '../test/testDb';
import { closeEmptyRooms, markUnoccupiedRoomsEmpty } from './roomCleanup';

useTestDatabase();
afterEach(resetPresence);

const now = new Date('2026-11-01T12:00:00Z');
const minutesAgo = (mins: number) => new Date(now.getTime() - mins * 60_000);

async function roomEmptySince(emptySince: Date | null, { closedAt = null as Date | null } = {}) {
  const { user } = await createUserWithToken();
  const room = await createRoom(user.id, {
    name: 'Room',
    subject: '',
    description: '',
    isPublic: true,
    maxSize: 10,
    goals: ['Read chapter 1'],
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: false,
    },
  });
  await Room.updateOne({ _id: room.id }, { emptySince, closedAt });
  await Message.create({ roomId: room.id, userId: user.id, text: 'hi' });
  await Resource.create({
    roomId: room.id,
    userId: user.id,
    type: 'link',
    title: 'Notes',
    url: 'https://x.dev',
  });
  return { room, userId: user.id };
}

describe('closeEmptyRooms', () => {
  it('closes rooms empty for longer than the grace period and deletes their contents', async () => {
    const { room } = await roomEmptySince(minutesAgo(6));

    expect(await closeEmptyRooms(now)).toEqual([room.id]);

    const saved = await Room.findById(room.id).lean();
    expect(saved?.closedAt).toEqual(now);
    expect(saved?.goals).toEqual([]);
    expect(await Message.countDocuments({ roomId: room.id })).toBe(0);
    expect(await Resource.countDocuments({ roomId: room.id })).toBe(0);
    await expect(getInvitePreview(room.inviteCode!)).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
  });

  it('leaves alone rooms inside the grace period, occupied rooms and rooms already closed', async () => {
    const recent = await roomEmptySince(new Date(now.getTime() - ROOM_GRACE_MS + 1000));
    const occupied = await roomEmptySince(null);
    const reconnecting = await roomEmptySince(minutesAgo(10));
    const closed = await roomEmptySince(minutesAgo(10), { closedAt: minutesAgo(1) });
    // Someone whose tab dropped and is still inside the reconnect window.
    addSocket(reconnecting.room.id, 'socket-1', {
      userId: reconnecting.userId,
      profile: { name: 'Maya', username: 'maya', avatarColor: 'green' },
      status: 'focusing',
      maxSize: 10,
      hostId: reconnecting.userId,
      now,
    });

    expect(await closeEmptyRooms(now)).toEqual([]);
    for (const { room } of [recent, occupied, reconnecting]) {
      expect((await Room.findById(room.id).lean())?.closedAt).toBeNull();
      expect(await Message.countDocuments({ roomId: room.id })).toBe(1);
    }
    expect((await Room.findById(closed.room.id).lean())?.closedAt).toEqual(minutesAgo(1));
  });
});

describe('markUnoccupiedRoomsEmpty', () => {
  it('starts the grace period for open rooms nobody is in, as after a restart', async () => {
    const orphan = await roomEmptySince(null);
    const occupied = await roomEmptySince(null);
    addSocket(occupied.room.id, 'socket-1', {
      userId: occupied.userId,
      profile: { name: 'Maya', username: 'maya', avatarColor: 'green' },
      status: 'focusing',
      maxSize: 10,
      hostId: occupied.userId,
      now,
    });

    await markUnoccupiedRoomsEmpty(now);

    expect((await Room.findById(orphan.room.id).lean())?.emptySince).toEqual(now);
    expect((await Room.findById(occupied.room.id).lean())?.emptySince).toBeNull();
  });
});
