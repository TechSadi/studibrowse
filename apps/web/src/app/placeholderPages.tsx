import { ComingSoon } from '../components/layout/ComingSoon';
import { LogoutButton } from '../features/auth/LogoutButton';

// TODO: each of these is replaced by its real screen in a later phase-1 step.

export function SettingsPage() {
  return (
    <ComingSoon title="Settings" action={<LogoutButton />}>
      Your account, appearance, notifications, timer defaults and privacy.
    </ComingSoon>
  );
}
