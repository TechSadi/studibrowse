export const MAX_ROOM_SIZE = 20;
export const MIN_ROOM_SIZE = 2;
/** Where the Create a room size slider starts. */
export const DEFAULT_ROOM_SIZE = 10;

export const ROOM_NAME_MAX = 60;
export const ROOM_SUBJECT_MAX = 40;
export const ROOM_DESCRIPTION_MAX = 200;
export const GOAL_TEXT_MAX = 80;

/** Invite codes are nanoid's URL-safe alphabet: 64^10 codes, so they can't be guessed. */
export const INVITE_CODE_LENGTH = 10;
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{10}$/;

/** Rooms worth joining loads 3 rows of 3 at a time. */
export const PUBLIC_ROOMS_PAGE_SIZE = 9;

export const TIMER_PHASES = ['focus', 'shortBreak', 'longBreak'] as const;
export type TimerPhase = (typeof TIMER_PHASES)[number];

/** The Home room filters, in mockup order. */
export const ROOM_FILTERS = ['all', 'open', 'focus', 'break'] as const;
export type RoomFilter = (typeof ROOM_FILTERS)[number];

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
export const SUBJECT_MAX = 40;

/** "What are you studying?" in onboarding, shown under your name on your profile. */
export const STUDYING_MAX = 80;

/** The subject chips offered in onboarding, in mockup order. */
export const ONBOARDING_SUBJECTS = [
  'Maths',
  'Programming',
  'Chemistry',
  'Biology',
  'Medicine',
  'Languages',
  'History',
  'Law',
  'Exam prep',
  'Reading',
] as const;

/** "10h Steady", the first weekly goal option in onboarding. */
export const DEFAULT_WEEKLY_GOAL_MINS = 10 * 60;

/** The weekly goal cards in onboarding. Settings allows any whole number of hours up to the max. */
export const WEEKLY_GOAL_OPTIONS = [
  { hours: 5, label: 'Light' },
  { hours: 10, label: 'Steady' },
  { hours: 15, label: 'Serious' },
  { hours: 20, label: 'Exam mode' },
] as const;

export const WEEKLY_GOAL_MIN_MINS = 60;
export const WEEKLY_GOAL_MAX_MINS = 40 * 60;

export const DEFAULT_TIMER = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
} as const;

/** Stepper bounds for timer settings, shared by onboarding, Settings and the Create room dialog. */
export const TIMER_LIMITS = {
  focusMins: { min: 5, max: 90, step: 5 },
  shortBreakMins: { min: 1, max: 30, step: 1 },
  longBreakMins: { min: 5, max: 45, step: 5 },
  roundsBeforeLong: { min: 2, max: 8, step: 1 },
  totalRounds: { min: 1, max: 12, step: 1 },
} as const;

/** How many people onboarding suggests following. */
export const SUGGESTED_USERS_LIMIT = 5;

/** How long a password reset link works. The Forgot password screen quotes it. */
export const RESET_TOKEN_TTL_MINS = 30;
