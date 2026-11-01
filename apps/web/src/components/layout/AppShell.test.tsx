import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowedUser, ProgressSummaryResponse, PublicUser } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeSummary } from '../../test/progressFixtures';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

let user: PublicUser | null;
let following: FollowedUser[] | 'error' | 'pending';
let summary: ProgressSummaryResponse | 'error';

function fakeFetch(input: string, init: RequestInit = {}) {
  const route = `${init.method ?? 'GET'} ${input.split('?')[0]}`;
  if (route === 'POST /api/auth/refresh') {
    return user
      ? Response.json({ accessToken: 'token', user })
      : Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } }, { status: 401 });
  }
  if (route === 'GET /api/users/me/following') {
    if (following === 'pending') return new Promise<Response>(() => undefined);
    if (following === 'error') {
      return Response.json({ error: { code: 'INTERNAL', message: 'Please try again.' } }, { status: 500 });
    }
    return Response.json({ users: following });
  }
  if (route === 'GET /api/progress/summary') {
    if (summary === 'error') {
      return Response.json({ error: { code: 'INTERNAL', message: 'Please try again.' } }, { status: 500 });
    }
    return Response.json(summary);
  }
  if (route === 'GET /api/sessions/mine') return Response.json({ sessions: [], nextCursor: null });
  throw new Error(`Unexpected request: ${route}`);
}

const sidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });

beforeEach(() => {
  user = makeUser();
  following = [];
  summary = makeSummary();
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('AppShell', () => {
  it('shows the sidebar menu with the current page marked, and the breadcrumb', async () => {
    renderRoutes('/progress');
    await screen.findByRole('heading', { level: 1, name: 'Your progress' });

    const menu = within(sidebar()).getByRole('navigation', { name: 'Main' });
    const links = within(menu).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Your progress', 'Notifications', 'Settings']);
    expect(within(menu).getByRole('link', { name: 'Your progress' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Your progress'),
    ).toBeDefined();
    await waitFor(() => expect(document.title).toBe('Your progress · StudiBrowse'));
  });

  it('has no Create button in the sidebar, but has one in the phone tab bar', async () => {
    renderRoutes('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(within(sidebar()).queryByRole('button', { name: /create/i })).toBeNull();

    const tabs = screen.getAllByRole('navigation', { name: 'Main' }).find((nav) => !sidebar().contains(nav))!;
    expect(Array.from(tabs.children, (el) => el.textContent)).toEqual([
      'Home',
      'Create',
      'Progress',
      'Settings',
    ]);
  });

  it('opens Create a room on Home from the tab bar', async () => {
    const router = renderRoutes('/progress');
    await screen.findByRole('heading', { level: 1, name: 'Your progress' });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(router.state.location.search).toBe('?create=1');
  });

  it('shows the streak and your profile', async () => {
    renderRoutes('/home');
    await screen.findByRole('heading', { level: 1, name: /Alex/ });
    expect(await within(sidebar()).findByText('No streak yet')).toBeDefined();
    const me = within(sidebar()).getByRole('link', { name: /Alex Smith/ });
    expect(me.getAttribute('href')).toBe('/settings');
    expect(within(me).getByText('alex@example.com')).toBeDefined();
  });

  it('shows the streak from your progress, counted on the server', async () => {
    summary = makeSummary({ streak: { current: 4, longest: 9, studiedToday: false } });
    renderRoutes('/home');
    await screen.findByRole('heading', { level: 1, name: /Alex/ });
    expect(await within(sidebar()).findByText('4-day streak')).toBeDefined();
    expect(within(sidebar()).getByText('One session today keeps it going.')).toBeDefined();
  });

  it('falls back to your saved streak when progress can’t load', async () => {
    summary = 'error';
    user = makeUser({ streak: { current: 3, longest: 3 }, lastStudiedAt: new Date().toISOString() });
    renderRoutes('/home');
    await screen.findByRole('heading', { level: 1, name: /Alex/ });
    expect(await within(sidebar()).findByText('3-day streak')).toBeDefined();
    expect(within(sidebar()).getByText('You studied today. Nice work.')).toBeDefined();
  });

  describe('People you follow', () => {
    it('asks you to follow people when you follow no one, without a request', async () => {
      renderRoutes('/home');
      expect(
        await within(await screen.findByRole('complementary')).findByText(/Follow people/),
      ).toBeDefined();
      expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/users/me/following')).toBe(false);
    });

    it('lists people by name, linking to their profiles', async () => {
      user = makeUser({ following: ['u2', 'u3'] });
      following = [
        { id: 'u2', name: 'Maya Kapoor', username: 'mayak', avatarColor: 'gold' },
        { id: 'u3', name: 'Jordan Lee', username: 'jordanl', avatarColor: 'blue' },
      ];
      renderRoutes('/home');
      const maya = await screen.findByRole('link', { name: /Maya Kapoor/ });
      expect(maya.getAttribute('href')).toBe('/u/mayak');
      expect(screen.getByRole('link', { name: /Jordan Lee/ })).toBeDefined();
    });

    it('shows a loading state', async () => {
      user = makeUser({ following: ['u2'] });
      following = 'pending';
      renderRoutes('/home');
      expect(await screen.findByText('Loading people you follow…')).toBeDefined();
    });

    it('shows an error with a retry', async () => {
      user = makeUser({ following: ['u2'] });
      following = 'error';
      renderRoutes('/home');
      await screen.findByText(/Couldn't load the people you follow/);

      following = [{ id: 'u2', name: 'Maya Kapoor', username: 'mayak', avatarColor: 'gold' }];
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('link', { name: /Maya Kapoor/ })).toBeDefined();
    });
  });

  it('sends signed-out visitors to log in', async () => {
    user = null;
    const router = renderRoutes('/home');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('shows the 404 page for an unknown path', async () => {
    renderRoutes('/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeDefined();
    expect((await screen.findByRole('link', { name: 'Back to Home' })).getAttribute('href')).toBe('/home');
  });
});
