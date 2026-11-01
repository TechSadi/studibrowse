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
  /** IANA time zone the streak's days are counted in. The web app keeps it in step with the browser. */
  timeZone: string;
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
 * The server-owned timer. Running: `endsAt` is set and `pausedRemaining` is null. Paused (or waiting for the host
 * between phases): `endsAt` is null and `pausedRemaining` holds the milliseconds left. `idle` and `done`: both null.
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

/** Someone in the room, as an invite shows them to a possibly signed-out visitor: initials only. */
export interface InvitePreviewMember {
  initials: string;
  avatarColor: AvatarColor;
}

/**
 * What an invite link shows before you join. The room id is included so a signed-in visitor can be sent into
 * the room; it grants nothing the code doesn't already (a private room still needs the code to join).
 */
export interface InvitePreview {
  id: string;
  name: string;
  subject: string;
  /** Empty when the host didn't set one. */
  description: string;
  host: RoomHost;
  memberCount: number;
  /** The first few people in the room, longest present first. */
  members: InvitePreviewMember[];
  maxSize: number;
  timer: RoomTimer;
  timerSettings: TimerSettings;
  goals: { text: string; done: boolean }[];
}

/** What an invite link to a closed room shows: enough to follow the host. */
export interface ClosedRoomPreview {
  name: string;
  host: RoomHost;
  /** Rooms the host opened per week, averaged over the last 4 weeks and rounded. */
  roomsPerWeek: number;
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

/** A closed room is a normal answer for an invite link, not an error. An unknown code is a 404. */
export type InvitePreviewResponse =
  { status: 'open'; room: InvitePreview } | { status: 'closed'; room: ClosedRoomPreview };

/**
 * POST /api/rooms/:id/uploads/sign. The client posts `fields` plus the file (as `file`) to `uploadUrl` and
 * gets back JSON with the file's `secure_url`.
 */
export interface UploadSignResponse {
  uploadUrl: string;
  fields: Record<string, string>;
}

/** One of your sessions (a timer run), with your own minutes in it. */
export interface MySession {
  id: string;
  roomName: string;
  /** ISO timestamps. `endedAt` is null while the run is still going. */
  startedAt: string;
  endedAt: string | null;
  focusedMins: number;
  roundsCompleted: number;
  /** The room's ticked goals, out of `goalsTotal`, when the session was last saved. */
  goalsDone: number;
  goalsTotal: number;
}

/** GET /api/sessions/mine/latest: what the session summary shows after you leave a room. */
export interface LatestSessionResponse {
  /** Your latest session in the room, or null if you have none (since `since`). */
  session: MySession | null;
  /** The room hasn't closed, so you can rejoin it. */
  roomOpen: boolean;
  /** Your focus this week (Sunday to Saturday in your time zone) against your weekly goal. */
  week: { focusMins: number; goalMins: number };
  /** Your current streak if you studied today, otherwise 0. */
  streakDays: number;
}
