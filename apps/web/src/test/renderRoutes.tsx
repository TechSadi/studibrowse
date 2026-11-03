import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { PublicUser } from '@studibrowse/shared';
import { routes } from '../app/routes';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../features/auth/AuthContext';

// Pages are lazy routes: the first visit to one in a test file compiles it on demand, which can take
// longer than Testing Library's default one-second wait.
configure({ asyncUtilTimeout: 5000 });

export function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'u1',
    name: 'Alex Smith',
    username: 'alexsmith',
    email: 'alex@example.com',
    avatarColor: 'green',
    studying: '',
    subjects: [],
    weeklyGoalMins: 600,
    timerDefaults: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
    },
    streak: { current: 0, longest: 0 },
    lastStudiedAt: null,
    // The browser's own zone, so the app has no reason to send it.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    following: [],
    notificationPrefs: { roomOpened: true, roomFull: true, memberJoined: true, roundEnded: true },
    privacy: { showStudying: true, showStats: true },
    onboardedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    hasPassword: true,
    googleLinked: false,
    passwordChangedAt: null,
    ...overrides,
  };
}

/** Renders the app's real routes at `path`, with the same providers as main.tsx. Returns the router. */
export function renderRoutes(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
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
