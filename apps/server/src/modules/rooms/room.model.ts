import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import {
  GOAL_TEXT_MAX,
  MAX_GOALS,
  MAX_ROOM_SIZE,
  MIN_ROOM_SIZE,
  ROOM_DESCRIPTION_MAX,
  ROOM_NAME_MAX,
  ROOM_SUBJECT_MAX,
  TIMER_PHASES,
} from '@studibrowse/shared';

const goalSchema = new Schema({
  text: { type: String, required: true, trim: true, maxlength: GOAL_TEXT_MAX },
  done: { type: Boolean, required: true, default: false },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const timerSettingsSchema = new Schema(
  {
    focusMins: { type: Number, required: true },
    shortBreakMins: { type: Number, required: true },
    longBreakMins: { type: Number, required: true },
    roundsBeforeLong: { type: Number, required: true },
    totalRounds: { type: Number, required: true },
    autoStart: { type: Boolean, required: true },
  },
  { _id: false },
);

/** The source of truth for the shared timer. See docs/ARCHITECTURE.md › Timer. */
const timerSchema = new Schema(
  {
    phase: { type: String, enum: TIMER_PHASES, required: true },
    round: { type: Number, required: true, min: 1 },
    endsAt: { type: Date, default: null },
    pausedRemaining: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * The current run (start → done or reset): focus time credited so far and rounds finished, for its session log.
 * Internal: never serialised. See docs/ARCHITECTURE.md › Sessions.
 */
const runSchema = new Schema(
  {
    /** The id its session document gets, so a partial save and the final one write the same document. */
    sessionId: { type: Schema.Types.ObjectId, default: null },
    startedAt: { type: Date, default: null },
    focus: {
      type: [
        new Schema(
          {
            userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            focusedMs: { type: Number, required: true, min: 0 },
            // When their focus was first and last credited, so a run across midnight counts both days.
            firstFocusAt: { type: Date, required: true },
            lastFocusAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    roundsCompleted: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const roomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: ROOM_NAME_MAX },
    subject: { type: String, trim: true, maxlength: ROOM_SUBJECT_MAX, default: '' },
    description: { type: String, trim: true, maxlength: ROOM_DESCRIPTION_MAX, default: '' },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isPublic: { type: Boolean, required: true },
    inviteCode: { type: String, required: true },
    maxSize: { type: Number, required: true, min: MIN_ROOM_SIZE, max: MAX_ROOM_SIZE },
    goals: {
      type: [goalSchema],
      default: [],
      validate: (goals: unknown[]) => goals.length <= MAX_GOALS,
    },
    timerSettings: { type: timerSettingsSchema, required: true },
    timer: { type: timerSchema, required: true },
    run: { type: runSchema, default: () => ({}) },
    totalSessions: { type: Number, required: true, default: 0 },
    totalFocusMins: { type: Number, required: true, default: 0 },
    /** Set while nobody is connected. The cleanup job deletes the room once the grace period passes. */
    emptySince: { type: Date, default: null },
    /** Set when the host closes the room. A closed room is never live. */
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

roomSchema.index({ inviteCode: 1 }, { unique: true });
// Rooms worth joining: live public rooms, newest first.
roomSchema.index({ isPublic: 1, closedAt: 1, createdAt: -1 });
// Profiles' "Hosting now", room-opened notifications and how often someone hosts (the Room closed page).
roomSchema.index({ hostId: 1, createdAt: -1 });

export type RoomDocument = HydratedDocument<InferSchemaType<typeof roomSchema>>;

export const Room = model('Room', roomSchema);
