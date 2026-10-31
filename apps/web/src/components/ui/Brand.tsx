import { Logo } from '../../assets/logo/Logo';
import styles from './Brand.module.css';

export function Brand({ className }: { className?: string }) {
  return (
    <div className={className ? `${styles.brand} ${className}` : styles.brand}>
      <span className={styles.mark}>
        <Logo />
      </span>
      StudiBrowse
    </div>
  );
}
