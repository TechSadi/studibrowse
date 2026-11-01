import { Link, NavLink } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { avatarTone, initialsOf } from '../../lib/avatar';
import { Avatar } from '../ui/Avatar';
import { Brand } from '../ui/Brand';
import { Icon, type IconName } from '../ui/Icon';
import { FollowingList } from './FollowingList';
import styles from './Sidebar.module.css';
import { StreakCard } from './StreakCard';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/progress', label: 'Your progress', icon: 'chart' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

export function Sidebar() {
  const { state } = useAuth();
  const { theme, toggle } = useTheme();
  const user = state.user;
  if (!user) return null;

  return (
    <aside className={styles.sidebar} aria-label="Sidebar">
      <Brand className={styles.brand} />
      <div className={styles.sideLabel} aria-hidden="true">
        Menu
      </div>
      <nav className={styles.nav} aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.active}` : styles.navItem)}
          >
            <Icon name={item.icon} />
            <span className={styles.label}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <section className={styles.follows} aria-labelledby="side-follows">
        <h2 id="side-follows" className={styles.sideLabel}>
          People you follow
        </h2>
        <FollowingList following={user.following} />
      </section>

      <div className={styles.spacer} />
      <button type="button" className={styles.theme} onClick={toggle}>
        <span className={styles.label}>
          Appearance
          <span className="sr-only">: switch to {theme === 'dark' ? 'light' : 'dark'} mode</span>
        </span>
        <Icon name={theme === 'light' ? 'sun' : 'moon'} />
      </button>
      <StreakCard user={user} className={styles.streak} />
      <Link to="/settings" className={styles.me}>
        <Avatar initials={initialsOf(user.name)} tone={avatarTone(user.avatarColor)} size="sm" />
        <span className={styles.meText}>
          <b>{user.name}</b>
          <small>{user.email}</small>
        </span>
      </Link>
    </aside>
  );
}
