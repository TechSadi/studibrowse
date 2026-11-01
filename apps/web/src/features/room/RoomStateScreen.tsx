import { useEffect } from 'react';
import { Link } from 'react-router';
import { Brand } from '../../components/ui/Brand';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Icon, type IconName } from '../../components/ui/Icon';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { CREATE_ROOM_PATH } from '../home/useCreateRoomDialog';
import type { EndedStatus } from './roomSession';
import styles from './RoomStateScreen.module.css';

export type RoomScreenKind = 'joining' | EndedStatus | 'error';

interface ScreenCopy {
  icon: IconName;
  title: string;
  text: string;
}

const COPY: Record<Exclude<RoomScreenKind, 'error'>, ScreenCopy> = {
  joining: {
    icon: 'users',
    title: 'Joining the room',
    text: 'Getting the timer and who’s here.',
  },
  full: {
    icon: 'users',
    title: 'This room is full',
    text: 'Every seat is taken right now. Try again in a bit, or join another room that’s live.',
  },
  closed: {
    icon: 'exit',
    title: 'This room has closed',
    text: 'It ended when everyone left. Rooms don’t stay open, but you can find one that’s live or open your own.',
  },
  notFound: {
    icon: 'search',
    title: 'We couldn’t find that room',
    text: 'The link may be wrong, or the room is private and needs its invite link.',
  },
  removed: {
    icon: 'exit',
    title: 'You were removed from this room',
    text: 'The host removed you from the room. You can join another room that’s live, or open your own.',
  },
};

interface RoomStateScreenProps {
  kind: RoomScreenKind;
  /** The server's message, for `error`. */
  message?: string;
  onRetry: () => void;
}

/** Everything the room route shows instead of the room (styled like the mockup's `#closed` card). */
export function RoomStateScreen({ kind, message, onRetry }: RoomStateScreenProps) {
  const copy: ScreenCopy =
    kind === 'error'
      ? { icon: 'x', title: 'We couldn’t open the room', text: message ?? 'Something went wrong.' }
      : COPY[kind];

  useEffect(() => {
    document.title = `${copy.title} · StudiBrowse`;
  }, [copy.title]);

  return (
    <div className={styles.solo}>
      <header className={styles.top}>
        <Link to="/home" className={styles.home} aria-label="StudiBrowse home">
          <Brand />
        </Link>
        <ThemeToggle />
      </header>
      <main className={styles.card}>
        <span className={styles.ico}>
          <Icon name={copy.icon} />
        </span>
        <h1>{copy.title}</h1>
        <p className="muted" role={kind === 'joining' ? 'status' : kind === 'error' ? 'alert' : undefined}>
          {copy.text}
        </p>
        {kind === 'joining' ? null : (
          <div className={styles.actions}>
            {kind === 'error' ? (
              <>
                <Button block onClick={onRetry}>
                  Try again
                </Button>
                <ButtonLink variant="ghost" block to="/home">
                  Back to Home
                </ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink block to="/home">
                  See rooms that are live now
                </ButtonLink>
                {kind === 'full' ? (
                  <Button variant="ghost" block onClick={onRetry}>
                    Try again
                  </Button>
                ) : (
                  <ButtonLink variant="ghost" block to={CREATE_ROOM_PATH}>
                    Open your own room
                  </ButtonLink>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
