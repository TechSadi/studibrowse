import { describe, expect, it } from 'vitest';
import type { AppNotification, NotificationListItem } from '@studibrowse/shared';
import {
  canJoin,
  groupByDay,
  markReadInPages,
  timeAgo,
  upsertNotification,
  type CachedPages,
} from './notificationList';

const NOW = new Date(2026, 10, 2, 15, 0); // 2 Nov, 3pm local

function item(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
  return {
    id: 'n1',
    type: 'roomStarted',
    roomId: 'r1',
    roomName: 'Late-night exam grind',
    text: 'Maya Kapoor opened a room',
    read: false,
    createdAt: NOW.toISOString(),
    roomOpen: true,
    ...overrides,
  };
}

const pages = (...items: NotificationListItem[]): CachedPages => ({
  pages: [{ notifications: items, nextCursor: null }],
  pageParams: [undefined],
});

describe('timeAgo', () => {
  it.each([
    [new Date(2026, 10, 2, 14, 59, 30), 'just now'],
    [new Date(2026, 10, 2, 14, 58), '2 min ago'],
    [new Date(2026, 10, 2, 13, 50), '1 h ago'],
    [new Date(2026, 10, 1, 23, 0), 'yesterday'],
    [new Date(2026, 9, 30, 12, 0), '3 days ago'],
  ])('%s reads "%s"', (at, text) => {
    expect(timeAgo(at.toISOString(), NOW)).toBe(text);
  });
});

describe('groupByDay', () => {
  it('splits at local midnight, keeping the order', () => {
    const a = item({ id: 'a', createdAt: new Date(2026, 10, 2, 9).toISOString() });
    const b = item({ id: 'b', createdAt: new Date(2026, 10, 2, 0, 0).toISOString() });
    const c = item({ id: 'c', createdAt: new Date(2026, 10, 1, 23, 59).toISOString() });
    const { today, earlier } = groupByDay([a, b, c], NOW);
    expect(today.map((n) => n.id)).toEqual(['a', 'b']);
    expect(earlier.map((n) => n.id)).toEqual(['c']);
  });
});

describe('canJoin', () => {
  it('offers Join only on an open room alert', () => {
    expect(canJoin(item())).toBe(true);
    expect(canJoin(item({ roomOpen: false }))).toBe(false);
    expect(canJoin(item({ type: 'memberJoined' }))).toBe(false);
  });
});

describe('upsertNotification', () => {
  const incoming: AppNotification = {
    id: 'burst',
    type: 'memberJoined',
    roomId: 'r1',
    roomName: 'Finals week focus',
    text: 'Ben Okafor and 2 others joined your room',
    read: false,
    createdAt: NOW.toISOString(),
  };

  it('puts a new one on top, as an open room', () => {
    const next = upsertNotification(pages(item({ id: 'old' })), incoming, 'all');
    expect(next.pages[0]!.notifications.map((n) => [n.id, n.roomOpen])).toEqual([
      ['burst', true],
      ['old', true],
    ]);
  });

  it('replaces an earlier copy of a growing burst instead of adding another', () => {
    const earlier = item({ id: 'burst', type: 'memberJoined', text: 'Ben Okafor joined your room' });
    const next = upsertNotification(pages(item({ id: 'old' }), earlier), incoming, 'all');
    expect(next.pages[0]!.notifications.map((n) => n.text)).toEqual([
      incoming.text,
      'Maya Kapoor opened a room',
    ]);
  });

  it('leaves it out of a tab it does not belong in', () => {
    expect(upsertNotification(pages(), incoming, 'rooms').pages[0]!.notifications).toEqual([]);
    expect(
      upsertNotification(pages(), { ...incoming, read: true }, 'unread').pages[0]!.notifications,
    ).toEqual([]);
  });
});

describe('markReadInPages', () => {
  it('marks one, or all', () => {
    const data = pages(item({ id: 'a' }), item({ id: 'b' }));
    expect(markReadInPages(data, 'a').pages[0]!.notifications.map((n) => n.read)).toEqual([true, false]);
    expect(markReadInPages(data, null).pages[0]!.notifications.map((n) => n.read)).toEqual([true, true]);
  });
});
