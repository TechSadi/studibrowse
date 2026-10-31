import { PlaceholderScreen } from '../../components/layout/PlaceholderScreen';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from '../auth/LogoutButton';

// TODO(phase-1 home): stand-in until the Home screen is built. It exists so sign-in redirects and logging out work.
export function HomePage() {
  const { state } = useAuth();
  return (
    <PlaceholderScreen title="You're in">
      <p>
        Logged in as <b>@{state.user?.username}</b>. Home is coming next.
      </p>
      <LogoutButton />
    </PlaceholderScreen>
  );
}
