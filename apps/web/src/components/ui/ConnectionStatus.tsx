import { useSocket } from '../../hooks/useSocket';
import styles from './ConnectionStatus.module.css';

const LABELS = { reconnecting: 'Reconnecting…', offline: 'Offline' } as const;

/**
 * Shows only when the live connection is lost. On phones it shrinks to the dot (the label stays for screen
 * readers and as a tooltip) so the header still fits at 375px. The live region is always rendered so screen readers announce
 * the change when the pill appears.
 */
export function ConnectionStatus() {
  const { status } = useSocket();
  const lost = status === 'reconnecting' || status === 'offline';
  return (
    <span role="status" aria-live="polite" className={styles.region}>
      {lost && (
        <span className={`${styles.pill} ${styles[status]}`} title={LABELS[status]}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>{LABELS[status]}</span>
        </span>
      )}
    </span>
  );
}
