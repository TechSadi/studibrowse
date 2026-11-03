import { Types } from 'mongoose';
import {
  PROFILE_RECENT_ROOMS,
  type FollowListQuery,
  type FollowListResponse,
  type ProfileRecentRoom,
  type ProfileStats,
  type RoomSummary,
  type UserProfile,
} from '@studibrowse/shared';
import { countMembers, isMember } from '../../realtime/presence';
import { unauthenticated } from '../auth/auth.errors';
import { Room } from '../rooms/room.model';
import { toRoomSummary, type RoomRecord } from '../rooms/rooms.serializer';
import { Session, type SessionRecord } from '../sessions/session.model';
import { displayedStreak, resolveTimeZone } from '../sessions/streak';
import {
  decodeFollowersCursor,
  decodeFollowingCursor,
  encodeFollowersCursor,
  encodeFollowingCursor,
} from './followCursor';
import { User, type UserDocument } from './user.model';
import { toFollowListUser, visibleStudying } from './user.serializer';
import { invalidFollowCursor, userNotFound } from './users.errors';

const MS_PER_DAY = 86_400_000;
/** Sessions read to find the latest few rooms; one room can have many sessions in a row. */
const RECENT_SESSIONS_SCANNED = 50;

/** Someone with a profile: an account that finished onboarding. */
async function findProfileUser(username: string): Promise<UserDocument> {
  const user = await User.findOne({ username, onboardedAt: { $ne: null } });
  if (!user) throw userNotFound();
  return user;
}

async function viewerFollowing(viewerId: string): Promise<Set<string>> {
  const viewer = await User.findById(viewerId, { following: 1 }).lean();
  if (!viewer) throw unauthenticated();
  return new Set(viewer.following.map((id) => id.toString()));
}

/** "2026-11" for `date` in `timeZone`, the format $dateToString gives with '%Y-%m'. */
function monthKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .format(date)
    .slice(0, 7);
}

async function focusMinsThisMonth(userId: Types.ObjectId, timeZone: string, now: Date): Promise<number> {
  const [row] = await Session.aggregate<{ total: number }>([
    // A month is at most 31 days, plus a day for any time zone's offset.
    {
      $match: {
        'participants.userId': userId,
        startedAt: { $gte: new Date(now.getTime() - 32 * MS_PER_DAY) },
      },
    },
    {
      $match: {
        $expr: {
          $eq: [
            { $dateToString: { format: '%Y-%m', date: '$startedAt', timezone: timeZone } },
            monthKey(now, timeZone),
          ],
        },
      },
    },
    { $unwind: '$participants' },
    { $match: { 'participants.userId': userId } },
    { $group: { _id: null, total: { $sum: '$participants.focusedMins' } } },
  ]);
  return row?.total ?? 0;
}

async function profileStats(user: UserDocument, now: Date): Promise<ProfileStats> {
  const timeZone = resolveTimeZone(user.timeZone);
  const [focusMins, roomsHosted] = await Promise.all([
    focusMinsThisMonth(user._id, timeZone, now),
    Room.countDocuments({ hostId: user._id }),
  ]);
  return {
    focusMinsThisMonth: focusMins,
    streak: displayedStreak(user.streak.current, user.lastStudiedAt ?? null, timeZone, now),
    roomsHosted,
  };
}

/**
 * The live room they host, if the viewer may see it: a public room, or a private one the viewer hosts or is in.
 * Rooms nobody is in (waiting out the close delay) aren't "hosting now".
 */
async function hostingNow(
  user: UserDocument,
  viewerId: string,
  following: Set<string>,
): Promise<RoomSummary | null> {
  const rooms = await Room.find({ hostId: user._id, closedAt: null })
    .sort({ createdAt: -1 })
    .lean<RoomRecord[]>();
  const room = rooms.find((candidate) => {
    const roomId = candidate._id.toString();
    if (countMembers(roomId) === 0) return false;
    return candidate.isPublic || user.id === viewerId || isMember(roomId, viewerId);
  });
  if (!room) return null;
  return toRoomSummary(room, user, {
    memberCount: countMembers(room._id.toString()),
    hostFollowed: following.has(user.id as string),
  });
}

/**
 * Their latest sessions, one row per room. Rooms that are private now only show to people who were in that
 * session (and to the user themselves), so a profile never reveals a private room to anyone else.
 */
async function recentRooms(user: UserDocument, viewerId: string): Promise<ProfileRecentRoom[]> {
  const sessions = await Session.find({ 'participants.userId': user._id })
    .sort({ startedAt: -1 })
    .limit(RECENT_SESSIONS_SCANNED)
    .lean<SessionRecord[]>();
  const roomIds = [...new Set(sessions.map((session) => session.roomId.toString()))];
  const rooms = await Room.find({ _id: { $in: roomIds } }, { hostId: 1, isPublic: 1 }).lean();
  const roomById = new Map(rooms.map((room) => [room._id.toString(), room]));
  const hostIds = [...new Set(rooms.map((room) => room.hostId.toString()))].filter((id) => id !== user.id);
  const hosts = await User.find({ _id: { $in: hostIds } }, { name: 1 }).lean();
  const hostNameById = new Map(
    hosts.map((host) => [host._id.toString(), host.name.split(' ')[0] ?? host.name]),
  );

  const seen = new Set<string>();
  const rows: ProfileRecentRoom[] = [];
  for (const session of sessions) {
    const roomId = session.roomId.toString();
    if (seen.has(roomId)) continue;
    seen.add(roomId);
    const room = roomById.get(roomId);
    const viewerWasThere = session.participants.some((p) => p.userId.toString() === viewerId);
    if (user.id !== viewerId && !room?.isPublic && !viewerWasThere) continue;
    const hostId = room?.hostId.toString() ?? null;
    rows.push({
      roomId,
      name: session.roomName,
      startedAt: session.startedAt.toISOString(),
      role: hostId === user.id ? 'hosted' : 'joined',
      hostName: hostId && hostId !== user.id ? (hostNameById.get(hostId) ?? null) : null,
      people: session.participants.length,
      focusedMins: session.participants.find((p) => p.userId.equals(user._id))?.focusedMins ?? 0,
      inProgress: session.endedAt === null,
    });
    if (rows.length === PROFILE_RECENT_ROOMS) break;
  }
  return rows;
}

/** Different rooms both people have focused in. */
async function roomsTogether(a: Types.ObjectId, b: string): Promise<number> {
  const roomIds = await Session.distinct('roomId', {
    'participants.userId': { $all: [a, new Types.ObjectId(b)] },
  });
  return roomIds.length;
}

/** Someone's profile as `viewerId` sees it. Their privacy settings hide parts of it from everyone else. */
export async function getProfile(viewerId: string, username: string, now = new Date()): Promise<UserProfile> {
  const user = await findProfileUser(username);
  const following = await viewerFollowing(viewerId);
  const isMe = user.id === viewerId;
  const showStats = isMe || user.privacy?.showStats !== false;

  const [followerCount, followingCount, stats, hosting, recent, together] = await Promise.all([
    User.countDocuments({ following: user._id }),
    // Deleted accounts can stay in someone's following list; they don't count.
    User.countDocuments({ _id: { $in: user.following } }),
    showStats ? profileStats(user, now) : null,
    hostingNow(user, viewerId, following),
    recentRooms(user, viewerId),
    isMe ? null : roomsTogether(user._id, viewerId),
  ]);

  return {
    id: user.id as string,
    name: user.name,
    username: user.username,
    avatarColor: user.avatarColor as UserProfile['avatarColor'],
    studying: isMe ? user.studying : visibleStudying(user),
    subjects: [...user.subjects],
    joinedAt: user.createdAt.toISOString(),
    followerCount,
    followingCount,
    isFollowing: following.has(user.id as string),
    isMe,
    stats,
    hostingNow: hosting,
    recentRooms: recent,
    studiedTogether: together,
  };
}

/** The people who follow `username`, newest accounts first. */
export async function listFollowers(
  viewerId: string,
  username: string,
  { cursor, limit }: FollowListQuery,
): Promise<FollowListResponse> {
  const user = await findProfileUser(username);
  const before = cursor === undefined ? null : decodeFollowersCursor(cursor);
  if (cursor !== undefined && before === null) throw invalidFollowCursor();

  const following = await viewerFollowing(viewerId);
  const filter = before
    ? { following: user._id, _id: { $lt: new Types.ObjectId(before) } }
    : { following: user._id };
  // One extra row tells us whether there's another page.
  const rows = await User.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    users: page.map((row) => toFollowListUser(row, following)),
    nextCursor: rows.length > limit ? encodeFollowersCursor(page.at(-1)!.id as string) : null,
  };
}

/** The people `username` follows, the ones they followed most recently first. Deleted accounts are left out. */
export async function listFollowingOf(
  viewerId: string,
  username: string,
  { cursor, limit }: FollowListQuery,
): Promise<FollowListResponse> {
  const user = await findProfileUser(username);
  const offset = cursor === undefined ? 0 : decodeFollowingCursor(cursor);
  if (offset === null) throw invalidFollowCursor();

  const following = await viewerFollowing(viewerId);
  const ids = user.following.map((id) => id.toString()).reverse();
  const pageIds = ids.slice(offset, offset + limit);
  const users = await User.find({ _id: { $in: pageIds } });
  const byId = new Map(users.map((row) => [row.id as string, row]));
  return {
    users: pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toFollowListUser(row, following)] : [];
    }),
    nextCursor: offset + limit < ids.length ? encodeFollowingCursor(offset + limit) : null,
  };
}
