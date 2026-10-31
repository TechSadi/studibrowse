import { useTheme } from '../../hooks/useTheme';
import { Icon } from './Icon';
import styles from './IconButton.module.css';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" className={styles.iconBtn} onClick={toggle} aria-label="Switch light or dark mode">
      <Icon name={theme === 'light' ? 'sun' : 'moon'} />
    </button>
  );
}
