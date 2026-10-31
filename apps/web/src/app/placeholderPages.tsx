import { Link, useParams } from 'react-router';
import { ComingSoon } from '../components/layout/ComingSoon';
import { PlaceholderScreen } from '../components/layout/PlaceholderScreen';
import { LogoutButton } from '../features/auth/LogoutButton';

// TODO: each of these is replaced by its real screen in a later phase-1 step.

export function ProgressPage() {
  return (
    <ComingSoon title="Your progress">
      This week against your goal, your streak, focus time by day and your session history.
    </ComingSoon>
  );
}

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

export function RoomPage() {
  return (
    <PlaceholderScreen title="Focus room">
      <p>Focus rooms are coming next.</p>
      <Link className="text-link" to="/home">
        Back to Home
      </Link>
    </PlaceholderScreen>
  );
}

export function InvitePage() {
  return (
    <PlaceholderScreen title="Room invite">
      <p>Invite links open once rooms are live. Ask your host to share it again soon.</p>
      <Link className="text-link" to="/">
        Go to StudiBrowse
      </Link>
    </PlaceholderScreen>
  );
}
