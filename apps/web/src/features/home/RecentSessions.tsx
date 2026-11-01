import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import styles from './Home.module.css';

/** Your last few sessions. Sessions are logged once rooms exist, so this starts empty. */
export function RecentSessions() {
  return (
    <section className={styles.section} aria-labelledby="recent-heading">
      <div className={styles.panel}>
        <div className={`${styles.sectionHead} ${styles.panelHead}`}>
          <h2 id="recent-heading">Your recent sessions</h2>
          <ButtonLink to="/progress" variant="ghost" size="sm">
            See all
          </ButtonLink>
        </div>
        <EmptyState title="No sessions yet">
          Your sessions will show up here after you leave a room: focus time, rounds and goals done.
        </EmptyState>
      </div>
    </section>
  );
}
