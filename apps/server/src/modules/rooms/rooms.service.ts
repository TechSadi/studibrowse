import { mongo, Types, type PipelineStage } from 'mongoose';
import {
  PUBLIC_ROOMS_PAGE_SIZE,
  RECENT_MESSAGES_LIMIT,
  type AvatarColor,
  type CreateRoomData,
  type InvitePreviewResponse,
  type PublicRoomsQuery,
  type PublicRoomsResponse,
  type RoomDetail,
  type RoomGoal,
  type RoomJoinData,
  type RoomSettingsUpdate,
} from '@studibrowse/shared';
import {
  countMembers,
  fullRoomIds,
  isMember,
  memberPreview,
  type MemberProfile,
} from '../../realtime/presence';
import { idleTimer } from '../../realtime/timer';
import { unauthenticated } from '../auth/auth.errors';
import { toChatMessage, type MessageRecord } from '../chat/chat.serializer';
import { Message } from '../chat/message.model';
import { Resource } from '../resources/resource.model';
import { toRoomResource, type ResourceRecord } from '../resources/resources.serializer';
import { User } from '../users/user.model';
import { generateInviteCode } from './inviteCode';
import { Room } from './room.model';
import { roomClosed, roomNotFound, roomTooSmall } from './rooms.errors';
import {
  toClosedRoomPreview,
  toInvitePreview,
  toRoomDetail,
  toRoomGoal,
  toRoomSummary,
  type HostRecord,
  type RoomRecord,
} from './rooms.serializer';

const HOST_FIELDS = { name: 1, username: 1, avatarColor: 1 } as const;

/** A collision among 64^10 codes is all but impossible, but the unique index has the final say. */
const INVITE_CODE_ATTEMPTS = 3;

/** `data` must already be parsed by the shared createRoomSchema. The creator becomes the host. */
export async function createRoom(userId: string, data: CreateRoomData): Promise<RoomDetail> {
  const host = await User.findById(userId, HOST_FIELDS).lean<HostRecord>();
  if (!host) throw unauthenticated();

  const { goals, ...fields } = data;
  for (let attempt = 1; ; attempt++) {
    try {
      const room = await Room.create({
        ...fields,
        hostId: userId,
        inviteCode: generateInviteCode(),
        goals: goals.map((text) => ({ text, done: false, addedBy: userId })),
        // Waits for the host to press Start.
        timer: idleTimer(),
        // Nobody is connected until the host's socket joins the room.
        emptySince: new Date(),
      });
      return toRoomDetail(room.toObject<RoomRecord>(), host, { memberCount: 0, viewerId: userId });
    } catch (err) {
      if (!isDuplicateInviteCode(err) || attempt >= INVITE_CODE_ATTEMPTS) throw err;
    }
  }
}

function isDuplicateInviteCode(err: unknown): boolean {
  return (
    err instanceof mongo.MongoServerError &&
    err.code === 11000 &&
    Object.hasOwn((err.keyPattern ?? {}) as object, 'inviteCode')
  );
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicRoomsMatch(query: PublicRoomsQuery): Record<string, unknown> {
  // Only ever public rooms that are still open: never private or closed ones.
  const match: Record<string, unknown> = { isPublic: true, closedAt: null };
  if (query.subject) match.subject = new RegExp(`^${escapeRegex(query.subject)}$`, 'i');
  if (query.q) {
    const contains = new RegExp(escapeRegex(query.q), 'i');
    match.$or = [{ name: contains }, { subject: contains }];
  }
  // A paused or not-yet-started room is neither in a round nor on a break, so both need a running timer.
  if (query.filter === 'focus') {
    match['timer.phase'] = 'focus';
    match['timer.endsAt'] = { $ne: null };
  }
  if (query.filter === 'break') {
    match['timer.phase'] = { $in: ['shortBreak', 'longBreak'] };
    match['timer.endsAt'] = { $ne: null };
  }
  if (query.filter === 'open') match._id = { $nin: fullRoomIds().map((id) => new Types.ObjectId(id)) };
  return match;
}

/**
 * Rooms worth joining: live public rooms, the ones hosted by people you follow first, then newest.
 * Rooms whose host account is gone are left out.
 */
export async function listPublicRooms(userId: string, query: PublicRoomsQuery): Promise<PublicRoomsResponse> {
  const me = await User.findById(userId, { following: 1 }).lean();
  if (!me) throw unauthenticated();

  const pipeline: PipelineStage[] = [
    { $match: publicRoomsMatch(query) },
    { $addFields: { hostFollowed: { $in: ['$hostId', me.following] } } },
    { $sort: { hostFollowed: -1, createdAt: -1, _id: -1 } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'hostId',
        foreignField: '_id',
        as: 'host',
        pipeline: [{ $project: HOST_FIELDS }],
      },
    },
    { $unwind: '$host' },
    { $skip: (query.page - 1) * PUBLIC_ROOMS_PAGE_SIZE },
    // One extra row tells us whether there's another page.
    { $limit: PUBLIC_ROOMS_PAGE_SIZE + 1 },
  ];
  const rows = await Room.aggregate<RoomRecord & { host: HostRecord; hostFollowed: boolean }>(pipeline);

  const rooms = rows.slice(0, PUBLIC_ROOMS_PAGE_SIZE).map((row) =>
    toRoomSummary(row, row.host, {
      memberCount: countMembers(row._id.toString()),
      hostFollowed: row.hostFollowed,
    }),
  );
  return { rooms, nextPage: rows.length > PUBLIC_ROOMS_PAGE_SIZE ? query.page + 1 : null };
}

/** A private room is visible to its host and to the people in it. */
export async function getRoom(userId: string, roomId: string): Promise<RoomDetail> {
  const room = await Room.findById(roomId).lean<RoomRecord>();
  if (!room || room.closedAt) throw roomNotFound();
  if (!room.isPublic && room.hostId.toString() !== userId && !isMember(roomId, userId)) throw roomNotFound();
  const host = await findHost(room);
  return toRoomDetail(room, host, { memberCount: countMembers(roomId), viewerId: userId });
}

/** How many people the invite preview's avatar stack shows before "+N". */
export const INVITE_PREVIEW_MEMBERS = 4;

const HOSTING_WINDOW_WEEKS = 4;

/**
 * Preview data for an invite link. Holding the code is what grants it, so private rooms preview too. A closed
 * room still answers, with just enough for the Room closed page to offer following the host.
 */
export async function getInvitePreview(code: string, now = new Date()): Promise<InvitePreviewResponse> {
  const room = await Room.findOne({ inviteCode: code }).lean<RoomRecord>();
  if (!room) throw roomNotFound();
  const host = await findHost(room);
  if (room.closedAt) {
    const roomsPerWeek = await hostRoomsPerWeek(room.hostId, now);
    return { status: 'closed', room: toClosedRoomPreview(room, host, roomsPerWeek) };
  }
  const roomId = room._id.toString();
  return {
    status: 'open',
    room: toInvitePreview(room, host, {
      memberCount: countMembers(roomId),
      members: memberPreview(roomId, INVITE_PREVIEW_MEMBERS),
    }),
  };
}

/** Rooms someone opened per week over the last 4 weeks, rounded ("Hosts about 3 rooms a week"). */
export async function hostRoomsPerWeek(hostId: Types.ObjectId | string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - HOSTING_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const count = await Room.countDocuments({ hostId, createdAt: { $gt: since, $lte: now } });
  return Math.round(count / HOSTING_WINDOW_WEEKS);
}

async function findHost(room: RoomRecord): Promise<HostRecord> {
  const host = await User.findById(room.hostId, HOST_FIELDS).lean<HostRecord>();
  // A room that outlived its host's account is treated as gone.
  if (!host) throw roomNotFound();
  return host;
}

export interface JoinableRoom {
  room: RoomRecord;
  host: HostRecord;
}

/**
 * The room `userId` asked to join, if they may. A private room needs its invite code unless you're its host
 * or already in it (another tab, or back inside the reconnect window). A wrong code gets the same answer as
 * a missing room, so neither ids nor codes can be probed.
 */
export async function loadJoinableRoom(
  userId: string,
  roomId: string,
  inviteCode?: string,
): Promise<JoinableRoom> {
  const room = await Room.findById(roomId).lean<RoomRecord>();
  if (!room) throw roomNotFound();
  if (room.closedAt) throw roomClosed();
  const allowed =
    room.isPublic ||
    room.hostId.toString() === userId ||
    isMember(roomId, userId) ||
    inviteCode === room.inviteCode;
  if (!allowed) throw roomNotFound();
  return { room, host: await findHost(room) };
}

/** How someone appears in a room's People list. */
export async function loadMemberProfile(userId: string): Promise<MemberProfile> {
  const user = await User.findById(userId, HOST_FIELDS).lean<HostRecord>();
  if (!user) throw unauthenticated();
  return { name: user.name, username: user.username, avatarColor: user.avatarColor as AvatarColor };
}

/** Everything room:join answers with except the members (from presence) and the server's clock. */
export async function getRoomSnapshot(
  { room, host }: JoinableRoom,
  viewerId: string,
): Promise<Omit<RoomJoinData, 'members' | 'serverNow'>> {
  const [resources, latest] = await Promise.all([
    Resource.find({ roomId: room._id }).sort({ createdAt: 1, _id: 1 }).lean<ResourceRecord[]>(),
    Message.find({ roomId: room._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_MESSAGES_LIMIT)
      .lean<MessageRecord[]>(),
  ]);
  const roomId = room._id.toString();
  return {
    room: toRoomDetail(room, host, { memberCount: countMembers(roomId), viewerId }),
    resources: resources.map(toRoomResource),
    messages: latest.reverse().map(toChatMessage),
  };
}

/** Someone is connected again, so the grace period is off. */
export async function markRoomOccupied(roomId: string): Promise<void> {
  await Room.updateOne({ _id: roomId }, { emptySince: null });
}

/** Nobody is connected: the cleanup job closes the room once the grace period passes. */
export async function markRoomEmpty(roomId: string, now: Date): Promise<void> {
  await Room.updateOne({ _id: roomId, closedAt: null }, { emptySince: now });
}

export async function setRoomHost(roomId: string, hostId: string): Promise<void> {
  await Room.updateOne({ _id: roomId }, { hostId });
}

export interface RoomSettingsResult {
  settings: RoomSettingsUpdate;
  goals: RoomGoal[];
  goalsChanged: boolean;
}

/**
 * Saves the host's Room settings. Goals are matched by text, so a goal that stays keeps its id, its tick and
 * who added it; new ones count as added by the host. A running phase keeps its `endsAt`: the timer reads the
 * settings again when the phase ends, so timer changes apply from the next phase.
 */
export async function updateRoomSettings(
  roomId: string,
  hostId: string,
  data: CreateRoomData,
  memberCount: number,
): Promise<RoomSettingsResult> {
  if (data.maxSize < memberCount) throw roomTooSmall(memberCount);
  const room = await Room.findById(roomId).lean<RoomRecord>();
  if (!room) throw roomNotFound();
  if (room.closedAt) throw roomClosed();

  const existing = new Map(room.goals.map((goal) => [goal.text, goal]));
  const goals = [...new Set(data.goals)].map(
    (text) =>
      existing.get(text) ?? {
        _id: new Types.ObjectId(),
        text,
        done: false,
        addedBy: new Types.ObjectId(hostId),
      },
  );
  const goalsChanged =
    goals.length !== room.goals.length || goals.some((goal, i) => !goal._id.equals(room.goals[i]!._id));

  const settings: RoomSettingsUpdate = {
    name: data.name,
    subject: data.subject,
    description: data.description,
    isPublic: data.isPublic,
    maxSize: data.maxSize,
    timerSettings: data.timerSettings,
  };
  await Room.updateOne({ _id: roomId, closedAt: null }, { ...settings, goals });
  return { settings, goals: goals.map(toRoomGoal), goalsChanged };
}
