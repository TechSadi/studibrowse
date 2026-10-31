import { createBrowserRouter, RouterProvider } from 'react-router';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { OnboardingRoute, PublicOnlyRoute, RequireAuth, RequireOnboarded } from '../features/auth/guards';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignupPage } from '../features/auth/SignupPage';
import { HomePage } from '../features/home/HomePage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { WelcomePage } from '../features/welcome/WelcomePage';
import { NotFoundPage } from './NotFoundPage';

const router = createBrowserRouter([
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
  {
    element: <RequireAuth />,
    children: [
      { element: <OnboardingRoute />, children: [{ path: '/onboarding', element: <OnboardingPage /> }] },
      // Accounts that haven't finished onboarding are sent there first.
      { element: <RequireOnboarded />, children: [{ path: '/home', element: <HomePage /> }] },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
