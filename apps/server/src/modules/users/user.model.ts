import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import {
  AVATAR_COLORS,
  DEFAULT_TIMER,
  DEFAULT_WEEKLY_GOAL_MINS,
  MAX_SUBJECTS,
  NAME_MAX,
  type AvatarColor,
} from '@studibrowse/shared';

function randomAvatarColor(): AvatarColor {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? AVATAR_COLORS[0];
}

const timerDefaultsSchema = new Schema(
  {
    focusMins: { type: Number, required: true, default: DEFAULT_TIMER.focusMins },
    shortBreakMins: { type: Number, required: true, default: DEFAULT_TIMER.shortBreakMins },
    longBreakMins: { type: Number, required: true, default: DEFAULT_TIMER.longBreakMins },
    roundsBeforeLong: { type: Number, required: true, default: DEFAULT_TIMER.roundsBeforeLong },
  },
  { _id: false },
);

const streakSchema = new Schema(
  {
    current: { type: Number, required: true, default: 0 },
    longest: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const notificationPrefsSchema = new Schema(
  {
    roomOpened: { type: Boolean, required: true, default: true },
    roomFull: { type: Boolean, required: true, default: true },
    memberJoined: { type: Boolean, required: true, default: true },
    roundEnded: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: NAME_MAX },
    // Always lowercase (the shared schema normalises it), so the unique index is case-insensitive.
    username: { type: String, required: true, lowercase: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // Absent for Google-only accounts. Never selected unless a query asks for it.
    passwordHash: { type: String, select: false },
    googleId: { type: String },
    avatarColor: { type: String, enum: AVATAR_COLORS, required: true, default: randomAvatarColor },
    subjects: {
      type: [String],
      default: [],
      validate: (subjects: string[]) => subjects.length <= MAX_SUBJECTS,
    },
    weeklyGoalMins: { type: Number, required: true, min: 0, default: DEFAULT_WEEKLY_GOAL_MINS },
    timerDefaults: { type: timerDefaultsSchema, required: true, default: () => ({}) },
    streak: { type: streakSchema, required: true, default: () => ({}) },
    lastStudiedAt: { type: Date, default: null },
    following: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    notificationPrefs: { type: notificationPrefsSchema, required: true, default: () => ({}) },
    onboardedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
// Only accounts linked to Google have a googleId, so uniqueness applies to those alone.
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
// Finds someone's followers (profiles, "someone you follow opened a room" notifications).
userSchema.index({ following: 1 });

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model('User', userSchema);
