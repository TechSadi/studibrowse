import { NavLink } from 'react-router';
import { useCreateRoomDialog } from '../../features/home/useCreateRoomDialog';
import { Icon, type IconName } from '../ui/Icon';
import styles from './TabBar.module.css';

function Tab({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}>
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

/** Phones only: the sidebar becomes this bottom bar. */
export function TabBar() {
  const createRoom = useCreateRoomDialog();
  return (
    <nav className={styles.tabbar} aria-label="Main">
      <Tab to="/home" label="Home" icon="home" />
      <button type="button" className={`${styles.tab} ${styles.create}`} onClick={createRoom.open}>
        <Icon name="plus" />
        Create
      </button>
      <Tab to="/progress" label="Progress" icon="chart" />
      <Tab to="/settings" label="Settings" icon="gear" />
    </nav>
  );
}
