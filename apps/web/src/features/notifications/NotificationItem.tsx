import type { NotificationListItem, NotificationType } from '@studibrowse/shared';
import buttonStyles from '../../components/ui/Button.module.css';
import { Icon, type IconName } from '../../components/ui/Icon';
import { canJoin, timeAgo } from './notificationList';
import styles from './Notifications.module.css';

// Looks like a small primary button; it's part of the row's button, so it can't be one itself.
const JOIN_CLASS = [buttonStyles.btn, buttonStyles.primary, buttonStyles.sm, styles.act].join(' ');

const ICON: Record<NotificationType, { name: IconName; tone: string | undefined }> = {
  roomStarted: { name: 'users', tone: styles.violet },
  roundEnded: { name: 'check', tone: styles.good },
  memberJoined: { name: 'bell', tone: undefined },
  roomFull: { name: 'bell', tone: undefined },
};

interface NotificationItemProps {
  item: NotificationListItem;
  now: Date;
  onOpen: (item: NotificationListItem) => void;
}

/** One row (`.notif-item` in the mockup). The whole row is the button; Join is part of its label. */
export function NotificationItem({ item, now, onOpen }: NotificationItemProps) {
  const icon = ICON[item.type];
  return (
    <button
      type="button"
      className={item.read ? styles.item : `${styles.item} ${styles.unread}`}
      onClick={() => onOpen(item)}
    >
      <span className={icon.tone ? `${styles.ico} ${icon.tone}` : styles.ico} aria-hidden="true">
        <Icon name={icon.name} />
      </span>
      <span className={styles.body}>
        <b>
          {item.text}
          {item.read ? null : <span className="sr-only"> (unread)</span>}
        </b>
        <small>
          {item.roomName} · <time dateTime={item.createdAt}>{timeAgo(item.createdAt, now)}</time>
        </small>
      </span>
      {canJoin(item) ? <span className={JOIN_CLASS}>Join</span> : null}
    </button>
  );
}
