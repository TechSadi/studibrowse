import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell, type ShellRouteHandle } from '../components/layout/AppShell';
import { OnboardingRoute, PublicOnlyRoute, RequireAuth, RequireOnboarded } from '../features/auth/guards';
import { WelcomePage } from '../features/welcome/WelcomePage';
import { NotFoundPage } from './NotFoundPage';
import { RouteFallback } from './RouteFallback';

const shell = (crumb: string): ShellRouteHandle => ({ crumb });

/**
 * Each page is its own chunk, downloaded when its route is first matched. The landing page and the
 * guards and shell (small, and needed on every visit) stay in the main bundle.
 */
function page<M>(load: () => Promise<M>, pick: (module: M) => ComponentType): RouteObject['lazy'] {
  return async () => ({ Component: pick(await load()) });
}

export const routes: RouteObject[] = [
  {
    HydrateFallback: RouteFallback,
    children: [
      {
        // Signed-in users skip these and go to onboarding or Home.
        element: <PublicOnlyRoute />,
        children: [
          { path: '/', element: <WelcomePage /> },
          {
            path: '/signup',
            lazy: page(
              () => import('../features/auth/SignupPage'),
              (m) => m.SignupPage,
            ),
          },
          {
            path: '/login',
            lazy: page(
              () => import('../features/auth/LoginPage'),
              (m) => m.LoginPage,
            ),
          },
          {
            path: '/forgot-password',
            lazy: page(
              () => import('../features/auth/ForgotPasswordPage'),
              (m) => m.ForgotPasswordPage,
            ),
          },
        ],
      },
      // Reachable signed in or out: the link comes from an email.
      {
        path: '/reset-password',
        lazy: page(
          () => import('../features/auth/ResetPasswordPage'),
          (m) => m.ResetPasswordPage,
        ),
      },
      // Invite links are shared with people who may not have an account yet.
      {
        path: '/r/:inviteCode',
        lazy: page(
          () => import('../features/invite/InvitePage'),
          (m) => m.InvitePage,
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <OnboardingRoute />,
            children: [
              {
                path: '/onboarding',
                lazy: page(
                  () => import('../features/onboarding/OnboardingPage'),
                  (m) => m.OnboardingPage,
                ),
              },
            ],
          },
          // Accounts that haven't finished onboarding are sent there first.
          {
            element: <RequireOnboarded />,
            children: [
              {
                element: <AppShell />,
                children: [
                  {
                    path: '/home',
                    lazy: page(
                      () => import('../features/home/HomePage'),
                      (m) => m.HomePage,
                    ),
                    handle: shell('Home'),
                  },
                  {
                    path: '/progress',
                    lazy: page(
                      () => import('../features/progress/ProgressPage'),
                      (m) => m.ProgressPage,
                    ),
                    handle: shell('Your progress'),
                  },
                  {
                    path: '/notifications',
                    lazy: page(
                      () => import('../features/notifications/NotificationsPage'),
                      (m) => m.NotificationsPage,
                    ),
                    handle: shell('Notifications'),
                  },
                  {
                    path: '/settings',
                    lazy: page(
                      () => import('../features/settings/SettingsPage'),
                      (m) => m.SettingsPage,
                    ),
                    handle: shell('Settings'),
                  },
                  {
                    path: '/u/:username',
                    lazy: page(
                      () => import('../features/profile/ProfilePage'),
                      (m) => m.ProfilePage,
                    ),
                    handle: shell('Profile'),
                  },
                ],
              },
              // The focus room is distraction-free: no sidebar. It's the heaviest page, so it loads on its own.
              {
                path: '/room/:roomId',
                lazy: page(
                  () => import('../features/room/RoomPage'),
                  (m) => m.RoomPage,
                ),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
