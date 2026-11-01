import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_TEXT_MAX, type ChatMessage, type PresenceMember } from '@studibrowse/shared';
import { Avatar } from '../../../components/ui/Avatar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { avatarTone, initialsOf } from '../../../lib/avatar';
import styles from './ChatPanel.module.css';
import { MessageText } from './MessageText';
import { typingText } from './typingText';
import { useRoomChat } from './useRoomChat';

interface ChatPanelProps {
  roomId: string;
  /** The room:join ack's messages. */
  initialMessages: ChatMessage[];
  myUserId: string;
  /** Who is in the room, for names and avatars. */
  members: PresenceMember[];
  /** Shows the "keep messages short" note during a focus round. */
  focusRound: boolean;
}

/** How close to the bottom counts as "reading the latest", so new messages scroll into view. */
const STICK_TO_BOTTOM_PX = 80;

/** "19:05", like the mockup. */
function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The Chat pane of the focus room's side panel. */
export function ChatPanel({ roomId, initialMessages, myUserId, members, focusRound }: ChatPanelProps) {
  const { messages, typingUserIds, send, notifyTyping } = useRoomChat(roomId, initialMessages, myUserId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const membersById = new Map(members.map((member) => [member.userId, member]));
  const typingNames = typingUserIds.flatMap((id) => membersById.get(id)?.name.split(/\s+/)[0] ?? []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastMessage = messages.at(-1);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (atBottom.current || lastMessage?.userId === myUserId) scroller.scrollTop = scroller.scrollHeight;
  }, [lastMessage, myUserId]);

  function onScroll() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    atBottom.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await send(text);
      setDraft('');
    } catch (err) {
      // The draft stays, so nothing is lost.
      setError(err instanceof Error ? err.message : 'Your message wasn’t sent. Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.pane}>
      <div
        ref={scrollRef}
        className={styles.scroll}
        onScroll={onScroll}
        // Focusable so the history can be scrolled from the keyboard.
        tabIndex={0}
        role="log"
        aria-label="Room chat"
      >
        {messages.length === 0 ? (
          <EmptyState title="No messages yet">Say hello. Chat is best kept for the breaks.</EmptyState>
        ) : (
          <ol className={styles.msgs}>
            {messages.map((message) => {
              const mine = message.userId === myUserId;
              const author = membersById.get(message.userId);
              const name = mine ? 'You' : (author?.name ?? 'Someone');
              return (
                <li key={message.id} className={mine ? `${styles.msg} ${styles.mine}` : styles.msg}>
                  {mine ? null : (
                    <Avatar
                      initials={author ? initialsOf(author.name) : '?'}
                      tone={author ? avatarTone(author.avatarColor) : 1}
                      size="sm"
                    />
                  )}
                  <div className={styles.body}>
                    <div className={styles.meta}>
                      {name}
                      <time dateTime={message.createdAt}>{clockTime(message.createdAt)}</time>
                    </div>
                    <div className={styles.bubble}>
                      <MessageText text={message.text} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className={styles.typing} aria-live="polite">
        {typingText(typingNames)}
      </div>

      <div className={styles.foot}>
        <form className={styles.compose} onSubmit={(event) => void onSubmit(event)}>
          <input
            className={styles.input}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              notifyTyping(event.target.value);
            }}
            onBlur={() => notifyTyping('')}
            placeholder="Message the room"
            aria-label="Message"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'chat-error' : undefined}
            autoComplete="off"
            maxLength={CHAT_TEXT_MAX}
          />
          <button className={styles.send} type="submit" aria-label="Send" disabled={sending}>
            <Icon name="send" className={styles.sendIcon} />
          </button>
        </form>
        {error ? (
          <p id="chat-error" className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {focusRound ? (
          <div className={styles.quietNote}>
            <Icon name="moon" className={styles.noteIcon} />
            Focus round in progress. Keep messages short.
          </div>
        ) : null}
      </div>
    </div>
  );
}
