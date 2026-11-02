import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '@studibrowse/shared';

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  /** The room's name when this was sent: the room may be gone by the time it's read. */
  roomName: { type: String, required: true },
  text: { type: String, required: true },
  read: { type: Boolean, required: true, default: false },
  /** When it last changed: a grouped burst moves to the top each time it grows. */
  createdAt: { type: Date, required: true },
  // Internal, for grouping bursts (see notification.service.ts). Never serialised.
  /** Who joined, oldest first. The first one's name leads the text. */
  actorIds: { type: [Schema.Types.ObjectId], default: [] },
  actorName: { type: String, default: '' },
  /** When the burst began. Joins within NOTIFICATION_GROUP_WINDOW_MS of it join the same notification. */
  groupStartedAt: { type: Date, required: true },
  /** The round that ended, for roundEnded. */
  round: { type: Number, default: null },
});

// Your notifications, newest first (the bell, the page and its cursor).
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
// The unread count and Mark all read.
notificationSchema.index({ userId: 1, read: 1 });
// Finding the burst a new join belongs to.
notificationSchema.index({ userId: 1, roomId: 1, type: 1, groupStartedAt: -1 });

export type NotificationRecord = InferSchemaType<typeof notificationSchema> & {
  _id: Types.ObjectId;
  type: NotificationType;
};

export const Notification = model('Notification', notificationSchema);
