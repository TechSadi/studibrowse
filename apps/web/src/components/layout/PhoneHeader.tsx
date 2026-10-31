import { Link } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { Avatar } from '../ui/Avatar';
import { Brand } from '../ui/Brand';
import { Icon } from '../ui/Icon';
import iconButton from '../ui/IconButton.module.css';
import { ThemeToggle } from '../ui/ThemeToggle';
import styles from './PhoneHeader.module.css';

/** Phones only: logo, theme, notifications and your account, above the page (the mockup's .topnav). */
export function PhoneHeader() {
  const { state } = useAuth();
  const user = state.user;
  if (!user) return null;

  return (
    <header className={styles.header}>
      <Link to="/home" className={styles.home} aria-label="StudiBrowse home">
        <Brand />
      </Link>
      <div className={styles.right}>
        <ThemeToggle />
        <Link to="/notifications" className={iconButton.iconBtn} aria-label="Notifications">
          <Icon name="bell" />
        </Link>
        <Link to="/settings" className={styles.me} aria-label="Your account">
          <Avatar initials={initialsOf(user.name)} tone={avatarTone(user.avatarColor)} size="sm" />
        </Link>
      </div>
    </header>
  );
}
