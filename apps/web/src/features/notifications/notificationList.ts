// Pure helpers for the bell and the Notifications page: times, Today/Earlier, and keeping cached pages current.
import type {
  AppNotification,
  NotificationFilter,
  NotificationListItem,
  NotificationsResponse,
} from '@studibrowse/shared';

const MIN = 60_000;
const HOUR = 60 * MIN;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "just now", "2 min ago", "1 h ago", "yesterday", "3 days ago", as the mockup's detail lines read. */
export function timeAgo(iso: string, now: Date): string {
  const at = new Date(iso);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MIN) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MIN)} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / (24 * HOUR));
  if (days <= 0) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Splits a newest-first list into today (in your time zone) and everything before. */
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  now: Date,
): { today: T[]; earlier: T[] } {
  const midnight = startOfDay(now);
  return {
    today: items.filter((item) => new Date(item.createdAt).getTime() >= midnight),
    earlier: items.filter((item) => new Date(item.createdAt).getTime() < midnight),
  };
}

export function matchesFilter(item: AppNotification, filter: NotificationFilter): boolean {
  if (filter === 'unread') return !item.read;
  if (filter === 'rooms') return item.type === 'roomStarted';
  return true;
}

/** A room alert offers Join while the room is open. */
export function canJoin(item: NotificationListItem): boolean {
  return item.type === 'roomStarted' && item.roomOpen;
}

export interface CachedPages {
  pages: NotificationsResponse[];
  pageParams: unknown[];
}

/**
 * Puts a notification from notification:new at the top of a cached list. A grouped burst arrives again with
 * the same id, so any older copy is taken out first.
 */
export function upsertNotification(
  data: CachedPages,
  incoming: AppNotification,
  filter: NotificationFilter,
): CachedPages {
  const pages = data.pages.map((page) => ({
    ...page,
    notifications: page.notifications.filter((item) => item.id !== incoming.id),
  }));
  if (matchesFilter(incoming, filter) && pages[0]) {
    // It just happened, so its room is open.
    pages[0] = { ...pages[0], notifications: [{ ...incoming, roomOpen: true }, ...pages[0].notifications] };
  }
  return { ...data, pages };
}

/** Marks one notification (or, with null, all of them) as read in a cached list. */
export function markReadInPages(data: CachedPages, id: string | null): CachedPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      notifications: page.notifications.map((item) =>
        id === null || item.id === id ? { ...item, read: true } : item,
      ),
    })),
  };
}
