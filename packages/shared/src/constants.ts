export const MAX_ROOM_SIZE = 20;

/** How long an empty room stays open, so a refresh or dropped connection doesn't end it. */
export const ROOM_GRACE_MS = 5 * 60 * 1000;

export const MAX_GOALS = 10;

export const MAX_FILE_MB = 10;

/** Avatar swatches offered in onboarding and Settings, in mockup order. */
export const AVATAR_COLORS = ['green', 'gold', 'blue', 'purple', 'red', 'olive'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const NAME_MAX = 50;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
/** bcrypt ignores everything past 72 bytes, so longer passwords would give a false sense of strength. */
export const PASSWORD_MAX = 72;

export const MAX_SUBJECTS = 10;

/** "10h Steady", the first weekly goal option in onboarding. */
export const DEFAULT_WEEKLY_GOAL_MINS = 10 * 60;

export const DEFAULT_TIMER = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
} as const;

/** How long a password reset link works. The Forgot password screen quotes it. */
export const RESET_TOKEN_TTL_MINS = 30;
