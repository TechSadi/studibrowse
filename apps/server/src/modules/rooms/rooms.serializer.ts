import type { Types } from 'mongoose';
import {
  initialsOf,
  type AvatarColor,
  type ClosedRoomPreview,
  type InvitePreview,
  type RoomDetail,
  type RoomGoal,
  type RoomHost,
  type RoomSummary,
  type RoomTimer,
  type TimerPhase,
  type TimerSettings,
} from '@studibrowse/shared';

/** A room as `.lean()`, `toObject()` or an aggregation returns it. */
export interface RoomRecord {
  _id: Types.ObjectId;
  name: string;
  subject: string;
  description: string;
  hostId: Types.ObjectId;
  isPublic: boolean;
  inviteCode: string;
  maxSize: number;
  goals: { _id: Types.ObjectId; text: string; done: boolean; addedBy: Types.ObjectId }[];
  timerSettings: TimerSettings;
  timer: { phase: string; round: number; endsAt: Date | null; pausedRemaining: number | null };
  totalSessions: number;
  totalFocusMins: number;
  closedAt: Date | null;
  createdAt: Date;
}

/** The host fields rooms are shown with. */
export interface HostRecord {
  _id: Types.ObjectId;
  name: string;
  username: string;
  avatarColor: string;
}

// Each function copies an explicit list of fields, so a new internal field can't leak by accident.

function toRoomHost(host: HostRecord): RoomHost {
  return {
    id: host._id.toString(),
    name: host.name,
    username: host.username,
    avatarColor: host.avatarColor as AvatarColor,
  };
}

export function toRoomTimer(timer: RoomRecord['timer']): RoomTimer {
  return {
    phase: timer.phase as TimerPhase,
    round: timer.round,
    endsAt: timer.endsAt?.toISOString() ?? null,
    pausedRemaining: timer.pausedRemaining ?? null,
  };
}

function toTimerSettings(settings: TimerSettings): TimerSettings {
  return {
    focusMins: settings.focusMins,
    shortBreakMins: settings.shortBreakMins,
    longBreakMins: settings.longBreakMins,
    roundsBeforeLong: settings.roundsBeforeLong,
    totalRounds: settings.totalRounds,
    autoStart: settings.autoStart,
  };
}

export function toRoomSummary(
  room: RoomRecord,
  host: HostRecord,
  { memberCount, hostFollowed }: { memberCount: number; hostFollowed: boolean },
): RoomSummary {
  return {
    id: room._id.toString(),
    name: room.name,
    subject: room.subject,
    host: toRoomHost(host),
    isPublic: room.isPublic,
    maxSize: room.maxSize,
    memberCount,
    isLive: memberCount > 0,
    timer: toRoomTimer(room.timer),
    timerSettings: toTimerSettings(room.timerSettings),
    createdAt: room.createdAt.toISOString(),
    hostFollowed,
  };
}

export function toRoomGoal(goal: RoomRecord['goals'][number]): RoomGoal {
  return { id: goal._id.toString(), text: goal.text, done: goal.done, addedBy: goal.addedBy.toString() };
}

/** The room for someone allowed to see it. `viewerId` decides isHost and whether a private room's code is shown. */
export function toRoomDetail(
  room: RoomRecord,
  host: HostRecord,
  { memberCount, viewerId }: { memberCount: number; viewerId: string },
): RoomDetail {
  const isHost = room.hostId.toString() === viewerId;
  const { hostFollowed: _, ...summary } = toRoomSummary(room, host, { memberCount, hostFollowed: false });
  return {
    ...summary,
    description: room.description,
    goals: room.goals.map(toRoomGoal),
    inviteCode: isHost || room.isPublic ? room.inviteCode : null,
    isHost,
    totalSessions: room.totalSessions,
    totalFocusMins: room.totalFocusMins,
  };
}

/** What an invite link shows, possibly to someone signed out. People in the room appear as initials only. */
export function toInvitePreview(
  room: RoomRecord,
  host: HostRecord,
  { memberCount, members }: { memberCount: number; members: { name: string; avatarColor: string }[] },
): InvitePreview {
  return {
    id: room._id.toString(),
    name: room.name,
    subject: room.subject,
    description: room.description,
    host: toRoomHost(host),
    memberCount,
    members: members.map((member) => ({
      initials: initialsOf(member.name),
      avatarColor: member.avatarColor as AvatarColor,
    })),
    maxSize: room.maxSize,
    timer: toRoomTimer(room.timer),
    timerSettings: toTimerSettings(room.timerSettings),
    goals: room.goals.map((goal) => ({ text: goal.text, done: goal.done })),
  };
}

/** What an invite link to a closed room shows: the room's name and who to follow. */
export function toClosedRoomPreview(
  room: RoomRecord,
  host: HostRecord,
  roomsPerWeek: number,
): ClosedRoomPreview {
  return { name: room.name, host: toRoomHost(host), roomsPerWeek };
}
