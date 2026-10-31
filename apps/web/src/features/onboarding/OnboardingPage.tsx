import { PlaceholderScreen } from '../../components/layout/PlaceholderScreen';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from '../auth/LogoutButton';

// TODO(phase-1 onboarding): stand-in until the 3-step onboarding is built. New accounts are redirected here.
export function OnboardingPage() {
  const { state } = useAuth();
  return (
    <PlaceholderScreen title="Welcome to StudiBrowse">
      <p>
        Your account <b>@{state.user?.username}</b> is ready. Onboarding is coming next.
      </p>
      <LogoutButton />
    </PlaceholderScreen>
  );
}
