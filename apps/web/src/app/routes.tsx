import type { RouteObject } from 'react-router';
import { AppShell, type ShellRouteHandle } from '../components/layout/AppShell';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { OnboardingRoute, PublicOnlyRoute, RequireAuth, RequireOnboarded } from '../features/auth/guards';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignupPage } from '../features/auth/SignupPage';
import { HomePage } from '../features/home/HomePage';
import { InvitePage } from '../features/invite/InvitePage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { RoomPage } from '../features/room/RoomPage';
import { WelcomePage } from '../features/welcome/WelcomePage';
import { NotFoundPage } from './NotFoundPage';
import { NotificationsPage, ProfilePage, SettingsPage } from './placeholderPages';

const shell = (crumb: string): ShellRouteHandle => ({ crumb });

export const routes: RouteObject[] = [
  {
    // Signed-in users skip these and go to onboarding or Home.
    element: <PublicOnlyRoute />,
    children: [
      { path: '/', element: <WelcomePage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Reachable signed in or out: the link comes from an email.
  { path: '/reset-password', element: <ResetPasswordPage /> },
  // Invite links are shared with people who may not have an account yet.
  { path: '/r/:inviteCode', element: <InvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      { element: <OnboardingRoute />, children: [{ path: '/onboarding', element: <OnboardingPage /> }] },
      // Accounts that haven't finished onboarding are sent there first.
      {
        element: <RequireOnboarded />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/home', element: <HomePage />, handle: shell('Home') },
              { path: '/progress', element: <ProgressPage />, handle: shell('Your progress') },
              { path: '/notifications', element: <NotificationsPage />, handle: shell('Notifications') },
              { path: '/settings', element: <SettingsPage />, handle: shell('Settings') },
              { path: '/u/:username', element: <ProfilePage />, handle: shell('Profile') },
            ],
          },
          // The focus room is distraction-free: no sidebar.
          { path: '/room/:roomId', element: <RoomPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
