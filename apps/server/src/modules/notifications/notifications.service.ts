import { Types } from 'mongoose';
import {
  NOTIFICATION_GROUP_WINDOW_MS,
  NOTIFICATION_PREF_BY_TYPE,
  ROOM_FULL_GROUP_WINDOW_MS,
  type AppNotification,
  type MarkReadData,
  type NotificationsQuery,
  type NotificationsResponse,
  type NotificationType,
} from '@studibrowse/shared';
import { createKeyedLock } from '../../lib/keyedLock';
import { countMembers, getHostId, isMember, listMembers } from '../../realtime/presence';
import { Room } from '../rooms/room.model';
import { User } from '../users/user.model';
import { Notification, type NotificationRecord } from './notification.model';
import { decodeNotificationCursor, encodeNotificationCursor } from './notificationCursor';
import { invalidCursor, notificationNotFound } from './notifications.errors';
import { toAppNotification, toListItem } from './notifications.serializer';
import { notificationText } from './notificationText';

/** Sends a saved notification to every tab of its user (the `user:<id>` Socket.IO room). */
export type EmitNotification = (userId: string, notification: AppNotification) => void;

export interface NotificationSenderOptions {
  emit: EmitNotification;
  /** The clock. Tests replace it. */
  now?: () => Date;
}

/** Creates notifications as things happen. See docs/ARCHITECTURE.md › Notifications. */
export interface NotificationSender {
  /** A room was opened: tells the host's followers, if the room is public. */
  roomOpened: (roomId: string) => Promise<void>;
  /** Someone joined: tells the room's current host. Joins in quick succession become one notification. */
  memberJoined: (roomId: string, joinerId: string) => Promise<void>;
  /** Tells the room's current host when the room has just filled up. */
  roomFull: (roomId: string) => Promise<void>;
  /** A focus round ended: tells everyone in the room. */
  roundEnded: (roomId: string, round: number) => Promise<void>;
}

export interface NotifiedRoom {
  _id: Types.ObjectId;
  name: string;
  hostId: Types.ObjectId;
  isPublic: boolean;
  maxSize: number;
}

async function loadOpenRoom(roomId: string): Promise<NotifiedRoom | null> {
  return Room.findOne(
    { _id: roomId, closedAt: null },
    { name: 1, hostId: 1, isPublic: 1, maxSize: 1 },
  ).lean<NotifiedRoom>();
}

/** Whether `userId` may know this room exists: it's public, or they host it or are in it. */
export function canSeeRoom(userId: string, room: NotifiedRoom): boolean {
  const roomId = room._id.toString();
  return (
    room.isPublic ||
    room.hostId.toString() === userId ||
    getHostId(roomId) === userId ||
    isMember(roomId, userId)
  );
}

const prefFilter = (type: NotificationType) => ({
  [`notificationPrefs.${NOTIFICATION_PREF_BY_TYPE[type]}`]: true,
});

/** The people among `userIds` who have this type switched on in Settings. */
async function withPrefOn(userIds: string[], type: NotificationType): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await User.find({ _id: { $in: userIds }, ...prefFilter(type) }, { _id: 1 }).lean();
  return users.map((user) => user._id.toString());
}

/** The host now: presence knows about a handover as soon as it happens. */
function currentHostId(room: NotifiedRoom): string {
  return getHostId(room._id.toString()) ?? room.hostId.toString();
}

export function createNotificationSender({
  emit,
  now = () => new Date(),
}: NotificationSenderOptions): NotificationSender {
  // A burst's find → update must not interleave with the next event for the same person and room.
  const withGroup = createKeyedLock();

  /** Saves one notification per recipient who can see the room, then sends each to its user. */
  async function deliver(
    recipients: string[],
    room: NotifiedRoom,
    type: NotificationType,
    text: string,
    round: number | null = null,
  ): Promise<void> {
    const visible = recipients.filter((userId) => canSeeRoom(userId, room));
    if (visible.length === 0) return;
    const at = now();
    const docs = await Notification.insertMany(
      visible.map((userId) => ({
        userId,
        type,
        roomId: room._id,
        roomName: room.name,
        text,
        createdAt: at,
        groupStartedAt: at,
        round,
      })),
    );
    for (const doc of docs) {
      emit(doc.userId.toString(), toAppNotification(doc.toObject<NotificationRecord>()));
    }
  }

  async function roomOpened(roomId: string): Promise<void> {
    const room = await loadOpenRoom(roomId);
    // Followers can't see a private room, so they never hear about one.
    if (!room?.isPublic) return;
    const host = await User.findById(room.hostId, { name: 1 }).lean();
    if (!host) return;
    const followers = await User.find(
      { following: room.hostId, _id: { $ne: room.hostId }, ...prefFilter('roomStarted') },
      { _id: 1 },
    ).lean();
    await deliver(
      followers.map((user) => user._id.toString()),
      room,
      'roomStarted',
      notificationText({ type: 'roomStarted', hostName: host.name }),
    );
  }

  async function memberJoined(roomId: string, joinerId: string): Promise<void> {
    const room = await loadOpenRoom(roomId);
    if (!room) return;
    const hostId = currentHostId(room);
    if (hostId === joinerId) return;
    const [recipient] = await withPrefOn([hostId], 'memberJoined');
    if (!recipient || !canSeeRoom(recipient, room)) return;
    const joiner = await User.findById(joinerId, { name: 1 }).lean();
    if (!joiner) return;

    await withGroup(`${recipient}:${roomId}:joined`, async () => {
      const at = now();
      const burst = await Notification.findOne({
        userId: recipient,
        roomId,
        type: 'memberJoined',
        read: false,
        groupStartedAt: { $gte: new Date(at.getTime() - NOTIFICATION_GROUP_WINDOW_MS) },
      })
        .sort({ groupStartedAt: -1 })
        .lean<NotificationRecord>();

      let saved: NotificationRecord | null;
      if (burst) {
        // Back again inside the window (a refresh, a second tab): nothing new to say.
        if (burst.actorIds.some((id) => id.toString() === joinerId)) return;
        saved = await Notification.findByIdAndUpdate(
          burst._id,
          {
            $push: { actorIds: new Types.ObjectId(joinerId) },
            $set: {
              createdAt: at,
              text: notificationText({
                type: 'memberJoined',
                firstName: burst.actorName,
                count: burst.actorIds.length + 1,
              }),
            },
          },
          { returnDocument: 'after' },
        ).lean<NotificationRecord>();
      } else {
        const created = await Notification.create({
          userId: recipient,
          type: 'memberJoined',
          roomId,
          roomName: room.name,
          text: notificationText({ type: 'memberJoined', firstName: joiner.name, count: 1 }),
          createdAt: at,
          groupStartedAt: at,
          actorIds: [joinerId],
          actorName: joiner.name,
        });
        saved = created.toObject<NotificationRecord>();
      }
      // The same id each time the burst grows, so the client replaces it.
      if (saved) emit(recipient, toAppNotification(saved));
    });
  }

  async function roomFull(roomId: string): Promise<void> {
    const room = await loadOpenRoom(roomId);
    if (!room || countMembers(roomId) < room.maxSize) return;
    const [recipient] = await withPrefOn([currentHostId(room)], 'roomFull');
    if (!recipient) return;
    await withGroup(`${recipient}:${roomId}:full`, async () => {
      // A seat that empties and fills again soon after isn't news.
      const recent = await Notification.exists({
        userId: recipient,
        roomId,
        type: 'roomFull',
        groupStartedAt: { $gte: new Date(now().getTime() - ROOM_FULL_GROUP_WINDOW_MS) },
      });
      if (recent) return;
      await deliver([recipient], room, 'roomFull', notificationText({ type: 'roomFull' }));
    });
  }

  async function roundEnded(roomId: string, round: number): Promise<void> {
    const room = await loadOpenRoom(roomId);
    if (!room) return;
    const members = listMembers(roomId).map((member) => member.userId);
    const recipients = await withPrefOn(members, 'roundEnded');
    await deliver(recipients, room, 'roundEnded', notificationText({ type: 'roundEnded', round }), round);
  }

  return { roomOpened, memberJoined, roomFull, roundEnded };
}

const FILTERS: Record<NotificationsQuery['filter'], Record<string, unknown>> = {
  all: {},
  unread: { read: false },
  rooms: { type: 'roomStarted' },
};

/** Your notifications, newest first, a page at a time. */
export async function listNotifications(
  userId: string,
  query: NotificationsQuery,
): Promise<NotificationsResponse> {
  const match: Record<string, unknown> = { userId, ...FILTERS[query.filter] };
  if (query.cursor) {
    const position = decodeNotificationCursor(query.cursor);
    if (!position) throw invalidCursor();
    match.$or = [
      { createdAt: { $lt: position.createdAt } },
      { createdAt: position.createdAt, _id: { $lt: new Types.ObjectId(position.id) } },
    ];
  }
  // One extra row tells us whether there's another page.
  const rows = await Notification.find(match)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .lean<NotificationRecord[]>();
  const page = rows.slice(0, query.limit);

  const roomIds = [...new Set(page.map((row) => row.roomId.toString()))];
  const openRooms =
    roomIds.length === 0 ? [] : await Room.find({ _id: { $in: roomIds }, closedAt: null }, { _id: 1 }).lean();
  const open = new Set(openRooms.map((room) => room._id.toString()));

  const last = page.at(-1);
  return {
    notifications: page.map((row) => toListItem(row, open.has(row.roomId.toString()))),
    nextCursor:
      rows.length > query.limit && last
        ? encodeNotificationCursor({ createdAt: last.createdAt, id: last._id.toString() })
        : null,
  };
}

export async function countUnread(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, read: false });
}

/** Marks one of your notifications, or all of them, as read. Returns how many are still unread. */
export async function markRead(userId: string, data: MarkReadData): Promise<number> {
  if ('all' in data) {
    await Notification.updateMany({ userId, read: false }, { read: true });
  } else {
    const result = await Notification.updateOne({ _id: data.id, userId }, { read: true });
    // Someone else's id gets the same answer as a missing one.
    if (result.matchedCount === 0) throw notificationNotFound();
  }
  return countUnread(userId);
}
