import type { RoomDetail } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { CopyLinkButton } from '../../components/ui/CopyLinkButton';
import { Icon } from '../../components/ui/Icon';
import iconButton from '../../components/ui/IconButton.module.css';
import { formatMins } from '../rooms/timerText';
import styles from './RoomBar.module.css';

interface RoomBarProps {
  room: RoomDetail;
  isHost: boolean;
  hostName: string | null;
  /** Null when there's no code to share (a private room you joined without one). */
  inviteUrl: string | null;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}

/** The room's name, its details and the room actions (mockup `.room-bar`). */
export function RoomBar({
  room,
  isHost,
  hostName,
  inviteUrl,
  soundOn,
  onToggleSound,
  onOpenSettings,
  onLeave,
}: RoomBarProps) {
  const full = room.memberCount >= room.maxSize;
  const sessions = `${room.totalSessions} session${room.totalSessions === 1 ? '' : 's'}`;
  return (
    <div className={styles.bar}>
      <button type="button" className={iconButton.iconBtn} aria-label="Leave room" onClick={onLeave}>
        <Icon name="left" />
      </button>
      <div className={styles.title}>
        <h1>{room.name}</h1>
        <div className={styles.meta}>
          <span className={styles.tag}>{room.subject || 'Any subject'}</span>
          <span className={full ? `${styles.cap} ${styles.full} num` : `${styles.cap} num`}>
            {room.memberCount}/{room.maxSize}
            <span className="sr-only"> people</span>
          </span>
          {isHost ? (
            <span className={styles.hostBadge}>
              <Icon name="crown" />
              You’re the host
            </span>
          ) : hostName ? (
            <span>Hosted by {hostName}</span>
          ) : null}
          <span className="num">
            {sessions} · {formatMins(room.totalFocusMins)} focused
          </span>
        </div>
      </div>
      <div className={styles.actions}>
        {inviteUrl ? <CopyLinkButton url={inviteUrl} /> : null}
        <Button
          variant="ghost"
          size="sm"
          className={styles.sound}
          aria-pressed={!soundOn}
          aria-label="Mute timer sounds"
          title={soundOn ? 'Mute timer sounds' : 'Turn timer sounds on'}
          onClick={onToggleSound}
        >
          <Icon name={soundOn ? 'volume' : 'volumeOff'} />
        </Button>
        {isHost ? (
          <Button variant="ghost" size="sm" onClick={onOpenSettings}>
            <Icon name="gear" />
            Settings
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onLeave}>
          <Icon name="exit" />
          Leave
        </Button>
      </div>
    </div>
  );
}
