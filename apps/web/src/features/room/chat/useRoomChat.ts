import { useCallback, useEffect, useRef, useState } from 'react';
import { TYPING_CLEAR_MS, TYPING_THROTTLE_MS, type ChatMessage } from '@studibrowse/shared';
import { useSocketEvent } from '../../../hooks/useSocket';
import { emitWithAck, getSocket } from '../../../lib/socket';

export interface RoomChat {
  /** Oldest first. */
  messages: ChatMessage[];
  /** Other people typing right now, in the order they started. */
  typingUserIds: string[];
  /** Sends a message. Throws ApiError with the server's message if it is refused. */
  send: (text: string) => Promise<void>;
  /** Call with the draft on every change: tells the room you're typing, throttled, and when you stop. */
  notifyTyping: (draft: string) => void;
}

function withMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  // The sender gets each message twice: in the ack and as chat:new.
  return messages.some((m) => m.id === message.id) ? messages : [...messages, message];
}

/**
 * The room's chat: starts from `initialMessages` (the room:join ack; pass a new array to start over) and
 * follows chat:new and chat:typing. Someone stops showing as typing TYPING_CLEAR_MS after their last
 * chat:typing, as soon as they say they stopped, or when their message arrives.
 */
export function useRoomChat(roomId: string, initialMessages: ChatMessage[], myUserId: string): RoomChat {
  const [messages, setMessages] = useState(initialMessages);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  const initialRef = useRef(initialMessages);
  useEffect(() => {
    if (initialRef.current === initialMessages) return;
    initialRef.current = initialMessages;
    setMessages(initialMessages);
  }, [initialMessages]);

  // ---- Other people typing ----

  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const stopShowingTyping = useCallback((userId: string) => {
    clearTimeout(typingTimers.current.get(userId));
    if (!typingTimers.current.delete(userId)) return;
    setTypingUserIds((ids) => ids.filter((id) => id !== userId));
  }, []);

  useEffect(() => {
    const timers = typingTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useSocketEvent('chat:typing', ({ roomId: from, userId, isTyping }) => {
    // Your own other tabs are relayed to you too.
    if (from !== roomId || userId === myUserId) return;
    if (!isTyping) {
      stopShowingTyping(userId);
      return;
    }
    clearTimeout(typingTimers.current.get(userId));
    typingTimers.current.set(
      userId,
      setTimeout(() => stopShowingTyping(userId), TYPING_CLEAR_MS),
    );
    setTypingUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
  });

  useSocketEvent('chat:new', ({ message }) => {
    if (message.roomId !== roomId) return;
    stopShowingTyping(message.userId);
    setMessages((current) => withMessage(current, message));
  });

  // ---- You typing ----

  const lastTypingSentAt = useRef<number | null>(null);

  const emitTyping = useCallback(
    (isTyping: boolean) => getSocket()?.emit('chat:typing', { roomId, isTyping }),
    [roomId],
  );

  const stopTyping = useCallback(() => {
    if (lastTypingSentAt.current === null) return;
    lastTypingSentAt.current = null;
    emitTyping(false);
  }, [emitTyping]);

  const notifyTyping = useCallback(
    (draft: string) => {
      if (!draft.trim()) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (lastTypingSentAt.current !== null && now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return;
      lastTypingSentAt.current = now;
      emitTyping(true);
    },
    [emitTyping, stopTyping],
  );

  // Leaving the room (or switching rooms) mid-sentence.
  useEffect(() => stopTyping, [stopTyping]);

  const send = useCallback(
    async (text: string) => {
      stopTyping();
      const { message } = await emitWithAck('chat:send', { roomId, text });
      setMessages((current) => withMessage(current, message));
    },
    [roomId, stopTyping],
  );

  return { messages, typingUserIds, send, notifyTyping };
}
