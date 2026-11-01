import { useSocket } from '../../hooks/useSocket';
import styles from './ReconnectBanner.module.css';

/**
 * Shown over the room while the live connection is down or the room is being rejoined. The room stays on
 * screen underneath (the timer keeps counting from `endsAt`); the server holds your place for 30 seconds.
 */
export function ReconnectBanner({ rejoining }: { rejoining: boolean }) {
  const { status } = useSocket();
  const offline = status === 'offline';
  const visible = rejoining || offline || status === 'reconnecting';
  return (
    <div role="status" aria-live="polite" className={styles.region}>
      {visible ? (
        <div className={styles.banner}>
          <span className={styles.dot} aria-hidden="true" />
          <span>
            <b>{offline ? 'You’re offline.' : 'Connection lost.'}</b>{' '}
            {offline ? 'We’ll rejoin the room when you’re back online.' : 'Reconnecting to the room…'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
