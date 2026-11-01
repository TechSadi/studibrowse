import { Link, NavLink } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { Avatar } from '../ui/Avatar';
import { Brand } from '../ui/Brand';
import { ConnectionStatus } from '../ui/ConnectionStatus';
import { Icon } from '../ui/Icon';
import iconButton from '../ui/IconButton.module.css';
import { ThemeToggle } from '../ui/ThemeToggle';
import styles from './PhoneHeader.module.css';

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.link} ${styles.active}` : styles.link;

/**
 * The mockup's .topnav: logo, theme, notifications and your account. On sidebar pages it shows on phones only.
 * The focus room has no sidebar, so its variant shows at every width, with Home and Progress links on wider screens.
 */
export function PhoneHeader({ variant = 'phone' }: { variant?: 'phone' | 'room' }) {
  const { state } = useAuth();
  const user = state.user;
  if (!user) return null;
  const room = variant === 'room';

  return (
    <header className={room ? `${styles.header} ${styles.room}` : styles.header}>
      <Link to="/home" className={styles.home} aria-label="StudiBrowse home">
        <Brand />
      </Link>
      {room ? (
        <nav className={styles.links} aria-label="Main">
          <NavLink to="/home" className={navClass}>
            Home
          </NavLink>
          <NavLink to="/progress" className={navClass}>
            Progress
          </NavLink>
        </nav>
      ) : null}
      <div className={styles.right}>
        <ConnectionStatus />
        <ThemeToggle />
        <Link to="/notifications" className={iconButton.iconBtn} aria-label="Notifications">
          <Icon name="bell" />
        </Link>
        <Link to="/settings" className={styles.me} aria-label="Your account">
          <Avatar initials={initialsOf(user.name)} tone={avatarTone(user.avatarColor)} size="sm" />
          {room ? <span className={styles.meName}>{user.name.split(/\s+/)[0]}</span> : null}
        </Link>
      </div>
    </header>
  );
}
