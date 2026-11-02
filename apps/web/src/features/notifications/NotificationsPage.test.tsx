import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification, NotificationListItem, PublicUser } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeSummary } from '../../test/progressFixtures';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

const listeners = new Map<string, (payload: { notification: AppNotification }) => void>();

vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({ socket: null, status: 'connected' }),
  useSocketEvent: (event: string, handler: (payload: { notification: AppNotification }) => void) => {
    listeners.set(event, handler);
  },
}));

const now = new Date();
const minutesAgo = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();
const daysAgo = (days: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12).toISOString();

function item(overrides: Partial<NotificationListItem>): NotificationListItem {
  return {
    id: 'n',
    type: 'roomStarted',
    roomId: 'r1',
    roomName: 'Late-night exam grind',
    text: 'Maya Kapoor opened a room',
    read: false,
    createdAt: minutesAgo(2),
    roomOpen: true,
    ...overrides,
  };
}

let user: PublicUser;
let notifications: NotificationListItem[] | 'error';
const posted: unknown[] = [];

function fakeFetch(input: string, init: RequestInit = {}) {
  const url = new URL(input, 'http://localhost');
  const route = `${init.method ?? 'GET'} ${url.pathname}`;
  if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
  if (route === 'GET /api/users/me/following') return Response.json({ users: [] });
  if (route === 'GET /api/progress/summary') return Response.json(makeSummary());
  if (route === 'GET /api/sessions/mine') return Response.json({ sessions: [], nextCursor: null });
  if (route === 'GET /api/notifications/unread-count') {
    const list = notifications === 'error' ? [] : notifications;
    return Response.json({ count: list.filter((n) => !n.read).length });
  }
  if (route === 'GET /api/notifications') {
    if (notifications === 'error') {
      return Response.json({ error: { code: 'INTERNAL', message: 'Please try again.' } }, { status: 500 });
    }
    const filter = url.searchParams.get('filter') ?? 'all';
    const list = notifications.filter((n) =>
      filter === 'unread' ? !n.read : filter === 'rooms' ? n.type === 'roomStarted' : true,
    );
    return Response.json({ notifications: list, nextCursor: null });
  }
  if (route === 'POST /api/notifications/read') {
    const body: unknown = JSON.parse(init.body as string);
    posted.push(body);
    return Response.json({ count: 0 });
  }
  throw new Error(`Unexpected request: ${route}`);
}

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(() => {
    FakeNotification.permission = 'granted';
    return Promise.resolve<NotificationPermission>('granted');
  });
}

beforeEach(() => {
  user = makeUser();
  notifications = [
    item({ id: 'today-open', text: 'Maya Kapoor opened a room' }),
    item({ id: 'today-closed', text: 'Jordan Lee opened a room', roomOpen: false, read: true }),
    item({
      id: 'yesterday',
      type: 'roomFull',
      text: 'Your room is full',
      roomName: 'Finals week focus',
      createdAt: daysAgo(1),
    }),
  ];
  FakeNotification.permission = 'default';
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('Notification', FakeNotification);
});

afterEach(() => {
  cleanup();
  listeners.clear();
  posted.length = 0;
  FakeNotification.requestPermission.mockClear();
  vi.unstubAllGlobals();
  setAccessToken(null);
  localStorage.clear();
});

async function openPage(path = '/notifications') {
  renderRoutes(path);
  await screen.findByRole('heading', { level: 1, name: 'Notifications' });
  await screen.findByText('Maya Kapoor opened a room');
}

describe('Notifications page', () => {
  it('groups Today and Earlier, with Join only on room alerts whose room is open', async () => {
    await openPage();
    const today = within(screen.getByRole('heading', { name: 'Today' }).parentElement!);
    const earlier = within(screen.getByRole('heading', { name: 'Earlier' }).parentElement!);

    const open = today.getByRole('button', { name: /Maya Kapoor opened a room/ });
    expect(within(open).getByText('Join')).toBeDefined();
    expect(within(open).getByText('(unread)', { exact: false })).toBeDefined();
    expect(within(today.getByRole('button', { name: /Jordan Lee/ })).queryByText('Join')).toBeNull();
    expect(earlier.getByRole('button', { name: /Your room is full/ }).textContent).toContain('yesterday');
  });

  it('filters with the tabs', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Jordan Lee opened a room')).toBeNull());
    expect(screen.getByRole('radio', { name: 'Unread' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Rooms opened' }));
    await screen.findByText('Jordan Lee opened a room');
    expect(screen.queryByText('Your room is full')).toBeNull();
  });

  it('shows the empty state', async () => {
    notifications = [];
    renderRoutes('/notifications');
    expect(await screen.findByText('Nothing here. You’re all caught up.')).toBeDefined();
  });

  it('shows an error with a retry', async () => {
    notifications = 'error';
    renderRoutes('/notifications');
    expect(await screen.findByText('Couldn’t load your notifications')).toBeDefined();
    notifications = [item({ id: 'back' })];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Maya Kapoor opened a room')).toBeDefined();
  });

  it('marks one read when you open it, and all with Mark all read', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: /Your room is full/ }));
    await waitFor(() => expect(posted).toEqual([{ id: 'yesterday' }]));

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(posted).toContainEqual({ all: true }));
  });

  it('puts a new notification on top as it arrives, replacing a burst that grew', async () => {
    await openPage();
    const joined: AppNotification = {
      id: 'burst',
      type: 'memberJoined',
      roomId: 'r9',
      roomName: 'Finals week focus',
      text: 'Ben Okafor joined your room',
      read: false,
      createdAt: new Date().toISOString(),
    };
    act(() => listeners.get('notification:new')!({ notification: joined }));
    await screen.findByText('Ben Okafor joined your room');
    act(() =>
      listeners.get('notification:new')!({
        notification: { ...joined, text: 'Ben Okafor and 2 others joined your room' },
      }),
    );
    await screen.findByText('Ben Okafor and 2 others joined your room');
    expect(screen.queryByText('Ben Okafor joined your room')).toBeNull();
    const rows = within(screen.getByRole('heading', { name: 'Today' }).parentElement!).getAllByRole('button');
    expect(rows[0]!.textContent).toContain('Ben Okafor and 2 others');
  });
});

describe('Enable browser notifications', () => {
  it('never asks on load, and asks when you click Enable', async () => {
    await openPage();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    const banner = screen.getByRole('region', { name: 'Browser notifications' });

    fireEvent.click(within(banner).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(FakeNotification.requestPermission).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Browser notifications' })).toBeNull());
  });

  it('stays away after Not now', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Browser notifications' })).toBeNull();
    cleanup();

    await openPage();
    expect(screen.queryByRole('region', { name: 'Browser notifications' })).toBeNull();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('is not offered once permission was decided', async () => {
    FakeNotification.permission = 'denied';
    await openPage();
    expect(screen.queryByRole('region', { name: 'Browser notifications' })).toBeNull();
  });
});

describe('the bell', () => {
  const topBarBell = () =>
    within(screen.getByRole('navigation', { name: 'Breadcrumb' }).parentElement!).getByRole('button', {
      name: /^Notifications/,
    });

  it('shows the unread count, opens the latest, and closes on Escape back to the bell', async () => {
    renderRoutes('/progress');
    const bell = await waitFor(topBarBell);
    await waitFor(() => expect(bell.getAttribute('aria-label')).toBe('Notifications, 2 unread'));

    fireEvent.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    expect(await within(panel).findByText('Maya Kapoor opened a room')).toBeDefined();
    expect(within(panel).getByRole('link', { name: 'See all notifications' })).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull());
    expect(document.activeElement).toBe(bell);
  });

  it('marks all read from the dropdown', async () => {
    renderRoutes('/progress');
    const bell = await waitFor(topBarBell);
    fireEvent.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await within(panel).findByText('Maya Kapoor opened a room');
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Mark all read' })).toHaveProperty('disabled', false),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(posted).toEqual([{ all: true }]));
  });
});
