import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CHAT_TEXT_MAX } from '@studibrowse/shared';

const messageSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: CHAT_TEXT_MAX },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// room:join loads a room's latest messages.
messageSchema.index({ roomId: 1, createdAt: -1 });

export type MessageDocument = HydratedDocument<InferSchemaType<typeof messageSchema>>;

export const Message = model('Message', messageSchema);
