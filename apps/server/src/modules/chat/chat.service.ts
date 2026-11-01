import type { ChatMessage } from '@studibrowse/shared';
import { toChatMessage } from './chat.serializer';
import { Message } from './message.model';

/** Saves a message. `text` has already been validated and trimmed. */
export async function createMessage(roomId: string, userId: string, text: string): Promise<ChatMessage> {
  const message = await Message.create({ roomId, userId, text });
  return toChatMessage(message);
}
