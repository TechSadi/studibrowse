import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Icon } from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Skeleton';
import { useNow } from '../../hooks/useNow';
import { EnableBrowserNotificationsLine } from './EnableBrowserNotifications';
import { NotificationItem } from './NotificationItem';
import styles from './Notifications.module.css';
import { useMarkRead, useNotifications, useUnreadCount } from './queries';
import { useOpenNotification } from './useOpenNotification';

/** How many of the latest the dropdown shows before "See all notifications". */
const PANEL_ITEMS = 6;
const PANEL_MAX_WIDTH = 380;
const GUTTER = 16;

/** Where the dropdown goes: beside a trigger on the left (the sidebar) on wide screens, else under it. */
function panelPosition(trigger: DOMRect): CSSProperties {
  const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 2 * GUTTER);
  if (trigger.left < 300 && window.innerWidth > 680) {
    return {
      left: Math.min(trigger.right + 12, window.innerWidth - width - GUTTER),
      top: Math.max(GUTTER, Math.min(trigger.top, window.innerHeight - 440)),
    };
  }
  return {
    right: Math.max(GUTTER, Math.min(window.innerWidth - trigger.right, window.innerWidth - width - GUTTER)),
    top: trigger.bottom + 10,
  };
}

function Panel({ id, style, onClose }: { id: string; style: CSSProperties; onClose: () => void }) {
  const now = new Date(useNow(60_000));
  const list = useNotifications('all');
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const open = useOpenNotification(onClose);
  const items = (list.data?.pages[0]?.notifications ?? []).slice(0, PANEL_ITEMS);

  let content: ReactNode;
  if (list.isPending) {
    content = (
      <div className={styles.panelLoading}>
        <span className="sr-only" role="status">
          Loading notifications
        </span>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} height={36} radius={10} />
        ))}
      </div>
    );
  } else if (list.isError) {
    content = (
      <p className={styles.panelNote}>
        Couldn’t load your notifications.{' '}
        <button type="button" className={styles.textButton} onClick={() => void list.refetch()}>
          Try again
        </button>
      </p>
    );
  } else if (items.length === 0) {
    content = <p className={styles.panelNote}>Nothing here. You’re all caught up.</p>;
  } else {
    content = items.map((item) => <NotificationItem key={item.id} item={item} now={now} onOpen={open} />);
  }

  return (
    <div id={id} className={styles.panel} style={style} role="dialog" aria-label="Notifications">
      <div className={styles.panelHead}>
        <h3>Notifications</h3>
        <button
          type="button"
          className={styles.textButton}
          disabled={!unread.data}
          onClick={() => markRead.mutate({ all: true })}
        >
          Mark all read
        </button>
      </div>
      <div className={styles.panelList}>{content}</div>
      <EnableBrowserNotificationsLine />
      <Link to="/notifications" className={styles.seeAll} onClick={onClose}>
        See all notifications
      </Link>
    </div>
  );
}

interface NotificationBellProps {
  className?: string | undefined;
  /** The trigger's content, given the unread count (the icon and dot, or the sidebar's label and count). */
  children: (unread: number) => ReactNode;
  /** Its accessible name when the content has no text of its own. */
  label?: string;
}

/** A bell trigger and its dropdown of the latest notifications (`.notif` in the mockup). */
export function NotificationBell({ className, children, label }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const unread = useUnreadCount().data ?? 0;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (open && triggerRef.current) setPosition(panelPosition(triggerRef.current.getBoundingClientRect()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || document.getElementById(panelId)?.contains(target)) return;
      close(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close, panelId]);

  const name = label ? (unread > 0 ? `${label}, ${unread} unread` : label) : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ? `${className} ${styles.trigger}` : styles.trigger}
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        {children(unread)}
      </button>
      {open
        ? createPortal(<Panel id={panelId} style={position} onClose={() => close(false)} />, document.body)
        : null}
    </>
  );
}

/** The square bell button in the top bar and the phone header, with a dot while anything is unread. */
export function NotificationBellButton({ className }: { className?: string | undefined }) {
  return (
    <NotificationBell className={className} label="Notifications">
      {(unread) => (
        <>
          <Icon name="bell" />
          {unread > 0 ? <span className={styles.badgeDot} aria-hidden="true" /> : null}
        </>
      )}
    </NotificationBell>
  );
}
