import {
  NOTIFICATION_FILTERS,
  type NotificationFilter,
  type NotificationListItem,
} from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useNow } from '../../hooks/useNow';
import { useSearchParam } from '../../hooks/useSearchParam';
import { onRadioKeyDown } from '../../lib/radioGroup';
import { EnableBrowserNotifications } from './EnableBrowserNotifications';
import { NotificationItem } from './NotificationItem';
import { groupByDay } from './notificationList';
import styles from './Notifications.module.css';
import { useMarkRead, useNotifications, useUnreadCount } from './queries';
import { useOpenNotification } from './useOpenNotification';

const TAB_LABELS: Record<NotificationFilter, string> = {
  all: 'All',
  unread: 'Unread',
  rooms: 'Rooms opened',
};

function isFilter(value: string): value is NotificationFilter {
  return (NOTIFICATION_FILTERS as readonly string[]).includes(value);
}

function FilterTabs({
  filter,
  onChange,
}: {
  filter: NotificationFilter;
  onChange: (f: NotificationFilter) => void;
}) {
  return (
    <div className={styles.tabs} role="radiogroup" aria-label="Show notifications">
      {NOTIFICATION_FILTERS.map((option, index) => {
        const on = option === filter;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={on ? `${styles.chip} ${styles.chipOn}` : styles.chip}
            onClick={() => onChange(option)}
            onKeyDown={(e) =>
              onRadioKeyDown(e, index, NOTIFICATION_FILTERS.length, (i) => onChange(NOTIFICATION_FILTERS[i]!))
            }
          >
            {TAB_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

function Group({
  title,
  items,
  now,
  onOpen,
}: {
  title: string;
  items: NotificationListItem[];
  now: Date;
  onOpen: (item: NotificationListItem) => void;
}) {
  if (items.length === 0) return null;
  const id = `nf-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={styles.group}>
        {title}
      </h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <NotificationItem item={item} now={now} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotificationList({ filter }: { filter: NotificationFilter }) {
  const now = new Date(useNow(60_000));
  const query = useNotifications(filter);
  const open = useOpenNotification();

  if (query.isPending) {
    return (
      <div className={styles.empty}>
        <span className="sr-only" role="status">
          Loading notifications
        </span>
        <Skeleton height={72} radius={20} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        className={styles.empty}
        title="Couldn’t load your notifications"
        action={
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const items = query.data.pages.flatMap((page) => page.notifications);
  if (items.length === 0) {
    return <EmptyState className={styles.empty} title="Nothing here. You’re all caught up." />;
  }
  const { today, earlier } = groupByDay(items, now);
  return (
    <>
      <Group title="Today" items={today} now={now} onOpen={open} />
      <Group title="Earlier" items={earlier} now={now} onOpen={open} />
      {query.hasNextPage ? (
        <div className={styles.more}>
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** /notifications (#notifications in the mockup). */
export function NotificationsPage() {
  const [param, setParam] = useSearchParam('filter');
  const filter: NotificationFilter = isFilter(param) ? param : 'all';
  const unread = useUnreadCount().data ?? 0;
  const markRead = useMarkRead();

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>Notifications</h1>
          <p>Rooms opened by people you follow, and what happened in your rooms.</p>
        </div>
        <Button variant="ghost" disabled={unread === 0} onClick={() => markRead.mutate({ all: true })}>
          Mark all read
        </Button>
      </div>
      <EnableBrowserNotifications />
      <FilterTabs filter={filter} onChange={(next) => setParam(next === 'all' ? '' : next)} />
      <NotificationList filter={filter} />
    </>
  );
}
