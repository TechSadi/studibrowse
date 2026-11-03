import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeSummary } from '../../test/progressFixtures';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({ socket: null, status: 'connected' }),
  useSocketEvent: () => undefined,
}));

interface Sent {
  route: string;
  body: unknown;
}

let user: PublicUser;
let sent: Sent[];
/** Answers for the next request to a route, instead of the default. */
let failures: Map<string, { status: number; code: string; message: string }>;

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function fakeFetch(input: string, init: RequestInit = {}) {
  const url = new URL(input, 'http://localhost');
  const route = `${init.method ?? 'GET'} ${url.pathname}`;
  const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  if (route !== 'POST /api/auth/refresh' && !route.startsWith('GET ')) sent.push({ route, body });

  const failure = failures.get(route);
  if (failure) {
    failures.delete(route);
    return error(failure.status, failure.code, failure.message);
  }

  switch (route) {
    case 'POST /api/auth/refresh':
      return Response.json({ accessToken: 'token', user });
    case 'GET /api/users/me/following':
      return Response.json({ users: [] });
    case 'GET /api/progress/summary':
      return Response.json(makeSummary());
    case 'GET /api/notifications/unread-count':
      return Response.json({ count: 0 });
    case 'GET /api/users/username-available':
      return Response.json({ available: url.searchParams.get('u') !== 'mayak' });
    case 'PATCH /api/users/me': {
      const patch = body as Partial<PublicUser>;
      user = {
        ...user,
        ...patch,
        notificationPrefs: { ...user.notificationPrefs, ...patch.notificationPrefs },
        privacy: { ...user.privacy, ...patch.privacy },
        timerDefaults: { ...user.timerDefaults, ...patch.timerDefaults },
      };
      return Response.json({ user });
    }
    case 'PATCH /api/users/me/email':
      user = { ...user, email: (body as { email: string }).email };
      return Response.json({ user });
    case 'POST /api/auth/forgot':
      return Response.json({ ok: true });
    case 'POST /api/auth/logout-all':
    case 'DELETE /api/users/me':
      return new Response(null, { status: 204 });
    default:
      // Welcome and other pages may load things after signing out; they don't matter here.
      return Response.json({}, { status: 404 });
  }
}

beforeEach(() => {
  user = makeUser({
    username: 'alexsmith',
    passwordChangedAt: new Date(Date.now() - 95 * 86_400_000).toISOString(),
  });
  sent = [];
  failures = new Map();
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

async function openSettings() {
  const router = renderRoutes('/settings');
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  return router;
}

const section = (name: string) => screen.getByRole('region', { name });

describe('SettingsPage', () => {
  it('shows every section with the side nav', async () => {
    await openSettings();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Account', 'Appearance', 'Notifications', 'Timer defaults', 'Privacy', 'Log out and delete']);
    for (const name of [
      'Account',
      'Appearance',
      'Notifications',
      'Timer defaults',
      'Privacy',
      'Log out and delete',
    ]) {
      expect(section(name)).toBeTruthy();
    }
    expect(screen.getByText('Last changed 3 months ago')).toBeTruthy();
  });

  it('moves to a section from the nav', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(screen.getByRole('button', { name: 'Privacy' }).getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(section('Privacy'));
  });

  it('saves a notification toggle and shows a toast', async () => {
    await openSettings();
    const toggle = within(section('Notifications')).getByRole('switch', { name: 'Someone joins' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(await screen.findByText('Notifications saved')).toBeTruthy();
    expect(sent).toEqual([
      { route: 'PATCH /api/users/me', body: { notificationPrefs: { memberJoined: false } } },
    ]);
  });

  it('flips a toggle back when saving fails', async () => {
    failures.set('PATCH /api/users/me', {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Please try again.',
    });
    await openSettings();
    const toggle = within(section('Privacy')).getByRole('switch', { name: 'Show stats' });
    fireEvent.click(toggle);
    expect(await screen.findByText('Couldn’t save that')).toBeTruthy();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('saves the theme as sb-theme and applies it', async () => {
    await openSettings();
    const dark = within(section('Appearance')).getByRole('radio', { name: 'Dark' });
    fireEvent.click(dark);
    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('sb-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await screen.findByText('Appearance saved')).toBeTruthy();
  });

  it('saves timer defaults once the clicking stops', async () => {
    await openSettings();
    const more = within(section('Timer defaults')).getByRole('button', { name: 'More focus' });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(await screen.findByText('Timer defaults saved')).toBeTruthy();
    expect(sent).toEqual([{ route: 'PATCH /api/users/me', body: { timerDefaults: { focusMins: 35 } } }]);
  });

  it('saves the weekly goal in hours', async () => {
    await openSettings();
    fireEvent.click(
      within(section('Timer defaults')).getByRole('button', { name: 'More weekly focus goal' }),
    );
    expect(await screen.findByText('Weekly goal saved')).toBeTruthy();
    expect(sent).toEqual([{ route: 'PATCH /api/users/me', body: { weeklyGoalMins: 660 } }]);
  });

  it('saves the name and bio with Save changes', async () => {
    await openSettings();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex Smithson' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Law, year 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Account saved')).toBeTruthy();
    expect(sent).toEqual([
      { route: 'PATCH /api/users/me', body: { name: 'Alex Smithson', studying: 'Law, year 1' } },
    ]);
  });

  it('shows the shared schema’s message for an empty name', async () => {
    await openSettings();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter your name.')).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it('shows a taken username on its field', async () => {
    failures.set('PATCH /api/users/me', {
      status: 409,
      code: 'USERNAME_TAKEN',
      message: '@jordan is taken.',
    });
    await openSettings();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'jordan' } });
    await screen.findByText('Available');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('@jordan is taken.')).toBeTruthy();
  });

  it('asks for the password before changing the email', async () => {
    await openSettings();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it’s you' });

    failures.set('PATCH /api/users/me/email', {
      status: 400,
      code: 'WRONG_PASSWORD',
      message: 'That password isn’t right.',
    });
    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change email' }));
    expect(await within(dialog).findByText('That password isn’t right.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Current password'), {
      target: { value: 'focus-time-1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change email' }));
    expect(await screen.findByText('Account saved')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent.at(-1)).toEqual({
      route: 'PATCH /api/users/me/email',
      body: { email: 'new@example.com', password: 'focus-time-1' },
    });
  });

  it('locks the email of a Google account', async () => {
    user = makeUser({ googleLinked: true, hasPassword: false });
    await openSettings();
    expect(screen.getByLabelText('Email').hasAttribute('readonly')).toBe(true);
    expect(screen.getByText('Managed by your Google account')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set a password' })).toBeTruthy();
  });

  it('emails a reset link from Change password', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Password reset email sent')).toBeTruthy();
    expect(sent).toEqual([{ route: 'POST /api/auth/forgot', body: { email: 'alex@example.com' } }]);
  });

  it('logs out of every device after confirming', async () => {
    const router = await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Log out everywhere' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log out of all devices?' });
    expect(sent).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(sent).toEqual([{ route: 'POST /api/auth/logout-all', body: undefined }]);
  });

  it('deletes the account only once the username is typed', async () => {
    const router = await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    const input = within(dialog).getByLabelText(/to confirm/);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'alexsmit' } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: ' AlexSmith ' } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(sent).toEqual([{ route: 'DELETE /api/users/me', body: { username: ' AlexSmith ' } }]);
    expect(await screen.findByText('Account deleted')).toBeTruthy();
  });
});
