import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser, SuggestedUser } from '@studibrowse/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { setAccessToken } from '../../lib/api';
import { AuthProvider } from '../auth/AuthContext';
import { OnboardingRoute, RequireAuth, RequireOnboarded } from '../auth/guards';
import { OnboardingPage } from './OnboardingPage';
import { saveStep } from './onboardingProgress';

const baseUser: PublicUser = {
  id: 'u1',
  name: 'Alex Smith',
  username: 'alexsmith',
  email: 'alex@example.com',
  avatarColor: 'green',
  studying: '',
  subjects: [],
  weeklyGoalMins: 600,
  timerDefaults: { focusMins: 25, shortBreakMins: 5, longBreakMins: 15, roundsBeforeLong: 4, totalRounds: 4 },
  streak: { current: 0, longest: 0 },
  lastStudiedAt: null,
  // The browser's own zone, so the app has no reason to send it.
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  following: [],
  notificationPrefs: { roomOpened: true, roomFull: true, memberJoined: true, roundEnded: true },
  onboardedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
};

const maya: SuggestedUser = {
  id: 'u2',
  name: 'Maya Kapoor',
  username: 'mayak',
  avatarColor: 'gold',
  studying: 'Pharmacy, year 3',
  subjects: [],
};

/** A tiny stand-in for the users API. Records PATCH bodies. */
let user: PublicUser;
let suggestions: SuggestedUser[] | 'error';
let patches: unknown[];

function fakeFetch(input: string, init: RequestInit = {}) {
  const method = init.method ?? 'GET';
  const body: unknown = init.body ? JSON.parse(init.body as string) : undefined;
  const route = `${method} ${input}`;
  if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
  if (route === 'PATCH /api/users/me') {
    patches.push(body);
    const { timerDefaults, onboarded, ...fields } = body as Record<string, unknown> & {
      timerDefaults?: object;
      onboarded?: true;
    };
    user = {
      ...user,
      ...fields,
      timerDefaults: { ...user.timerDefaults, ...timerDefaults },
      onboardedAt: onboarded ? '2026-10-31T10:00:00.000Z' : user.onboardedAt,
    };
    return Response.json({ user });
  }
  if (route === 'GET /api/users/suggestions') {
    if (suggestions === 'error') {
      return Response.json({ error: { code: 'INTERNAL', message: 'Please try again.' } }, { status: 500 });
    }
    return Response.json({ users: suggestions });
  }
  const follow = input.match(/^\/api\/users\/(\w+)\/follow$/);
  if (follow) {
    const id = follow[1]!;
    user = {
      ...user,
      following: method === 'POST' ? [...user.following, id] : user.following.filter((f) => f !== id),
    };
    return Response.json({ user });
  }
  throw new Error(`Unexpected request: ${route}`);
}

function renderApp(path = '/onboarding') {
  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [
          { element: <OnboardingRoute />, children: [{ path: '/onboarding', element: <OnboardingPage /> }] },
          { element: <RequireOnboarded />, children: [{ path: '/home', element: <h1>Home</h1> }] },
        ],
      },
      { path: '/login', element: <h1>Log in</h1> },
    ],
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  user = { ...baseUser };
  suggestions = [maya];
  patches = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  setAccessToken(null);
});

describe('OnboardingPage', () => {
  it('saves step 1 and moves to step 2', async () => {
    renderApp();
    await heading('Set up your profile');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Red' }));
    fireEvent.change(screen.getByLabelText(/What are you studying/), {
      target: { value: 'Computer Science, year 2' },
    });
    click('Maths');
    click('Law');
    click('Continue');

    await heading('Pick a weekly focus goal');
    expect(patches).toEqual([
      { avatarColor: 'red', studying: 'Computer Science, year 2', subjects: ['Maths', 'Law'] },
    ]);
    expect(localStorage.getItem('sb-onboarding:u1')).toBe('2');
  });

  it('saves the goal and timer on step 2', async () => {
    saveStep('u1', 2);
    renderApp();
    await heading('Pick a weekly focus goal');

    fireEvent.click(screen.getByRole('radio', { name: /15h/ }));
    click('More focus');
    click('Less rounds');
    click('Continue');

    await heading('Follow a few people');
    expect(patches).toEqual([
      { weeklyGoalMins: 900, timerDefaults: { focusMins: 30, shortBreakMins: 5, totalRounds: 3 } },
    ]);
  });

  it('reopens the stored step with the saved answers after a refresh', async () => {
    user = { ...user, weeklyGoalMins: 1200 };
    saveStep('u1', 2);
    renderApp();
    await heading('Pick a weekly focus goal');
    expect(screen.getByRole('radio', { name: /20h/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('goes Back without losing unsaved edits', async () => {
    renderApp();
    await heading('Set up your profile');
    click('Continue');
    await heading('Pick a weekly focus goal');
    fireEvent.click(screen.getByRole('radio', { name: /^5h/ }));

    click('Back');
    await heading('Set up your profile');
    click('Continue');
    await heading('Pick a weekly focus goal');
    expect(screen.getByRole('radio', { name: /^5h/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('follows and unfollows a suggested person', async () => {
    saveStep('u1', 3);
    renderApp();
    const row = (await screen.findByText('Maya Kapoor')).closest('li')!;
    expect(within(row).getByText('Pharmacy, year 3')).toBeDefined();

    fireEvent.click(within(row).getByRole('button', { name: 'Follow Maya Kapoor' }));
    await within(row).findByText('Following');
    expect(user.following).toEqual(['u2']);

    fireEvent.click(within(row).getByRole('button', { name: 'Follow Maya Kapoor' }));
    await within(row).findByText('Follow');
    expect(user.following).toEqual([]);
  });

  it('shows an empty state when there is no one to suggest', async () => {
    suggestions = [];
    saveStep('u1', 3);
    renderApp();
    expect(await screen.findByText('No one to suggest yet.')).toBeDefined();
  });

  it('shows an error with a retry when suggestions fail to load', async () => {
    suggestions = 'error';
    saveStep('u1', 3);
    renderApp();
    expect(await screen.findByText(/We couldn’t load suggestions/)).toBeDefined();

    suggestions = [maya];
    click('Try again');
    expect(await screen.findByText('Maya Kapoor')).toBeDefined();
  });

  it('finishes onboarding and goes Home', async () => {
    saveStep('u1', 3);
    const router = renderApp();
    await heading('Follow a few people');
    click(/Start studying/);

    await heading('Home');
    expect(router.state.location.pathname).toBe('/home');
    expect(patches).toEqual([{ onboarded: true }]);
    expect(localStorage.getItem('sb-onboarding:u1')).toBeNull();
    expect(screen.getByText('You’re all set')).toBeDefined();
  });

  it('skips to Home, keeping what was saved', async () => {
    renderApp();
    await heading('Set up your profile');
    click('Skip for now');
    await heading('Home');
    expect(patches).toEqual([{ onboarded: true }]);
  });

  it('carries on to the next path after finishing', async () => {
    saveStep('u1', 3);
    const router = renderApp('/onboarding?next=%2Fhome%3Ftab%3Dlive');
    await heading('Follow a few people');
    click(/Start studying/);
    await heading('Home');
    expect(router.state.location.search).toBe('?tab=live');
  });

  it('sends an onboarded user from /onboarding to Home, and a new user from Home to onboarding', async () => {
    user = { ...user, onboardedAt: '2026-10-01T10:00:00.000Z' };
    renderApp('/onboarding');
    await heading('Home');
    cleanup();

    user = { ...user, onboardedAt: null };
    renderApp('/home');
    await heading('Set up your profile');
  });

  it('keeps the user on the step and shows the error when saving fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) =>
        init?.method === 'PATCH'
          ? Response.json(
              { error: { code: 'VALIDATION_ERROR', message: 'Nothing to update.' } },
              { status: 400 },
            )
          : fakeFetch(input, init),
      ),
    );
    renderApp();
    await heading('Set up your profile');
    click('Continue');
    expect((await screen.findByRole('alert')).textContent).toBe('Nothing to update.');
    expect(screen.getByRole('heading', { level: 1, name: 'Set up your profile' })).toBeDefined();
  });
});
