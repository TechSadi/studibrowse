import type { AvatarColor, TimerPhase } from '../constants';

/** Body of every error response from the API. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: true;
  db: 'up' | 'down';
}

/**
 * A user as the API returns them to themselves. Built only by the server's toPublicUser(),
 * so secrets (password hash, Google id, tokens) never appear here.
 */
export interface PublicUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarColor: AvatarColor;
  /** "What are you studying?", e.g. "Pharmacy, year 3". Empty when not set. */
  studying: string;
  subjects: string[];
  weeklyGoalMins: number;
  timerDefaults: TimerDefaults;
  streak: { current: number; longest: number };
  /** ISO timestamp, or null before the first logged session. */
  lastStudiedAt: string | null;
  /** Ids of the people this user follows. */
  following: string[];
  notificationPrefs: NotificationPrefs;
  /** ISO timestamp, or null until onboarding is finished. */
  onboardedAt: string | null;
  createdAt: string;
}

export interface TimerDefaults {
  focusMins: number;
  shortBreakMins: number;
  longBreakMins: number;
  roundsBeforeLong: number;
  totalRounds: number;
}

/** The notification toggles in Settings. */
export interface NotificationPrefs {
  roomOpened: boolean;
  roomFull: boolean;
  memberJoined: boolean;
  roundEnded: boolean;
}

export interface AuthResponse {
  /** Short-lived JWT. Keep it in memory only; the refresh token travels in an httpOnly cookie. */
  accessToken: string;
  user: PublicUser;
}

/** Same body whether or not an account uses the email. */
export interface ForgotPasswordResponse {
  ok: true;
}

export interface MeResponse {
  user: PublicUser;
}

export interface UsernameAvailabilityResponse {
  available: boolean;
}

/** Someone onboarding suggests following. Only what the suggestion row shows. */
export interface SuggestedUser {
  id: string;
  name: string;
  username: string;
  avatarColor: AvatarColor;
  studying: string;
  subjects: string[];
}

export interface SuggestionsResponse {
  users: SuggestedUser[];
}

/** Someone you follow, as the sidebar lists them. */
export interface FollowedUser {
  id: string;
  name: string;
  username: string;
  avatarColor: AvatarColor;
}

export interface FollowingResponse {
  users: FollowedUser[];
}

export interface TimerSettings extends TimerDefaults {
  autoStart: boolean;
}

/**
 * The server-owned timer. Running: `endsAt` is set and `pausedRemaining` is null. Paused (or not started yet):
 * `endsAt` is null and `pausedRemaining` holds the milliseconds left.
 */
export interface RoomTimer {
  phase: TimerPhase;
  round: number;
  /** ISO timestamp. */
  endsAt: string | null;
  pausedRemaining: number | null;
}

export interface RoomGoal {
  id: string;
  text: string;
  done: boolean;
  addedBy: string;
}

/** The host as room cards and invites show them. */
export interface RoomHost {
  id: string;
  name: string;
  username: string;
  avatarColor: AvatarColor;
}

/** A room card in Rooms worth joining. */
export interface RoomSummary {
  id: string;
  name: string;
  /** Empty when the host didn't set one. */
  subject: string;
  host: RoomHost;
  isPublic: boolean;
  maxSize: number;
  memberCount: number;
  timer: RoomTimer;
  timerSettings: TimerSettings;
  /** You follow the host, so the card is highlighted and listed first. */
  hostFollowed: boolean;
}

export interface RoomDetail extends Omit<RoomSummary, 'hostFollowed'> {
  description: string;
  goals: RoomGoal[];
  /** Only the host sees a private room's code. */
  inviteCode: string | null;
  isHost: boolean;
  totalSessions: number;
  totalFocusMins: number;
  createdAt: string;
}

/** What an invite link shows before you join. No ids or codes beyond what the link already holds. */
export interface InvitePreview {
  name: string;
  subject: string;
  host: RoomHost;
  memberCount: number;
  maxSize: number;
  timer: RoomTimer;
  timerSettings: TimerSettings;
  goals: { text: string; done: boolean }[];
}

export interface RoomResponse {
  room: RoomDetail;
}

export type CreateRoomResponse = RoomResponse;

export interface PublicRoomsResponse {
  rooms: RoomSummary[];
  /** The page to ask for next, or null on the last page. */
  nextPage: number | null;
}

export interface InvitePreviewResponse {
  room: InvitePreview;
}
