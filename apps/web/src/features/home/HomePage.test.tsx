import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

let user: PublicUser;

function fakeFetch(input: string, init: RequestInit = {}) {
  const route = `${init.method ?? 'GET'} ${input}`;
  if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
  throw new Error(`Unexpected request: ${route}`);
}

async function renderHome(path = '/home') {
  const router = renderRoutes(path);
  await screen.findByRole('heading', { level: 1, name: /Alex/ });
  return router;
}

beforeEach(() => {
  user = makeUser({ weeklyGoalMins: 720 });
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setAccessToken(null);
});

describe('HomePage', () => {
  it('greets you by first name with today’s date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 19, 0));
    renderRoutes('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Good evening, Alex' })).toBeDefined();
    expect(screen.getByText('Friday, October 30')).toBeDefined();
  });

  it('shows empty states instead of rooms and sessions it doesn’t have', async () => {
    await renderHome();
    expect(screen.getByText('No rooms live right now')).toBeDefined();
    expect(screen.getByText('No live rooms right now')).toBeDefined();
    expect(screen.getByText('No sessions yet')).toBeDefined();
  });

  it('measures this week against your weekly goal', async () => {
    await renderHome();
    const weekly = screen.getByRole('region', { name: 'Your focus this week' });
    expect(within(weekly).getByText('of your 12 hour weekly goal')).toBeDefined();
    expect(
      within(weekly).getByRole('progressbar', { name: 'Weekly goal' }).getAttribute('aria-valuenow'),
    ).toBe('0');
  });

  it('opens Create a room through ?create=1', async () => {
    const router = await renderHome();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create a room' })[0]!);
    await waitFor(() => expect(router.state.location.search).toBe('?create=1'));
  });

  describe('join by link', () => {
    const input = () => screen.getByRole('textbox', { name: 'Invite link or code' });
    const join = () => fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    it('opens the invite from a pasted link', async () => {
      const router = await renderHome();
      fireEvent.change(input(), { target: { value: 'https://studibrowse.app/r/aB3xK9' } });
      join();
      await waitFor(() => expect(router.state.location.pathname).toBe('/r/aB3xK9'));
    });

    it('explains what’s wrong with an empty or invalid entry', async () => {
      await renderHome();
      join();
      expect((await screen.findByRole('alert')).textContent).toBe('Paste an invite link or code first.');

      fireEvent.change(input(), { target: { value: 'join my room please' } });
      expect(screen.queryByRole('alert')).toBeNull();
      join();
      expect((await screen.findByRole('alert')).textContent).toMatch(/doesn’t look like an invite/);
      expect(input().getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('filters rooms with the chips as a radio group', async () => {
    await renderHome();
    const group = screen.getByRole('radiogroup', { name: 'Filter rooms' });
    const all = within(group).getByRole('radio', { name: 'All rooms' });
    expect(all.getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(all, { key: 'ArrowRight' });
    const open = within(group).getByRole('radio', { name: 'Has space' });
    expect(open.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(open);
  });

  it('keeps the top-bar search and the rooms search in sync through ?q=', async () => {
    const router = await renderHome('/home?q=chem');
    const top = screen.getByRole('searchbox', { name: 'Search rooms' });
    const rooms = screen.getByRole('searchbox', { name: 'Search rooms or subjects' });
    expect((top as HTMLInputElement).value).toBe('chem');
    expect(screen.getByText('No live rooms match “chem”')).toBeDefined();

    fireEvent.change(rooms, { target: { value: 'law' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=law'));
    expect((top as HTMLInputElement).value).toBe('law');
  });

  it('focuses the top-bar search when you press /', async () => {
    await renderHome();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search rooms' }));
  });

  it('searches from another page by going to Home', async () => {
    const router = renderRoutes('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    const top = screen.getByRole('searchbox', { name: 'Search rooms' });
    fireEvent.change(top, { target: { value: 'physics' } });
    fireEvent.submit(top);
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(router.state.location.search).toBe('?q=physics');
  });
});
