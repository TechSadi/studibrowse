import type { AvatarColor } from '../constants';

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
