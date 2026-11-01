import type { Types } from 'mongoose';
import type { ChatMessage } from '@studibrowse/shared';

/** A message as `.lean()` returns it. */
export interface MessageRecord {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  text: string;
  createdAt: Date;
}

export function toChatMessage(message: MessageRecord): ChatMessage {
  return {
    id: message._id.toString(),
    roomId: message.roomId.toString(),
    userId: message.userId.toString(),
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}
