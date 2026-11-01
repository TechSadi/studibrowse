import { useParams } from 'react-router';
import { ComingSoon } from '../components/layout/ComingSoon';
import { LogoutButton } from '../features/auth/LogoutButton';

// TODO: each of these is replaced by its real screen in a later phase-1 step.

export function NotificationsPage() {
  return (
    <ComingSoon title="Notifications">
      Rooms opened by people you follow, and what happens in your rooms.
    </ComingSoon>
  );
}

export function SettingsPage() {
  return (
    <ComingSoon title="Settings" action={<LogoutButton />}>
      Your account, appearance, notifications, timer defaults and privacy.
    </ComingSoon>
  );
}

export function ProfilePage() {
  const { username = '' } = useParams();
  return (
    <ComingSoon title={`@${username}`}>
      Profiles show what someone is hosting now, their stats, recent rooms and followers.
    </ComingSoon>
  );
}
