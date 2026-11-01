import { model, Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

/**
 * One timer run in a room, from timer:start until done or reset. Written early when someone leaves mid-run
 * (`endedAt` stays null until the run ends), so their focus time is saved at once. See docs/ARCHITECTURE.md ›
 * Sessions.
 */
const sessionSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    roomName: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    participants: {
      type: [
        new Schema(
          {
            userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            focusedMins: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    goalsDone: { type: Number, required: true, default: 0 },
    // How many goals the room had, for "2/4". The room's own goals are emptied when it closes.
    goalsTotal: { type: Number, required: true, default: 0 },
    roundsCompleted: { type: Number, required: true, default: 0 },
    // The rounds the timer was set to run, for "3 of 4". Older sessions don't have it.
    roundsTotal: { type: Number, default: null },
  },
  { timestamps: true },
);

// Progress and the weekly goal: someone's sessions by when they started.
sessionSchema.index({ 'participants.userId': 1, startedAt: -1 });
// Session history: someone's sessions by when they ended, with _id to break ties for the cursor.
sessionSchema.index({ 'participants.userId': 1, endedAt: -1, _id: -1 });
// A room's history.
sessionSchema.index({ roomId: 1, startedAt: -1 });

/** A session as `.lean()` returns it. */
export type SessionRecord = InferSchemaType<typeof sessionSchema> & { _id: Types.ObjectId };
export type SessionDocument = HydratedDocument<InferSchemaType<typeof sessionSchema>>;

export const Session = model('Session', sessionSchema);
