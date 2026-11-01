import { RECENT_SESSIONS_COUNT, type MySession } from '@studibrowse/shared';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Skeleton';
import { peopleText, sessionDayLabel } from '../progress/format';
import { useMySessions } from '../progress/queries';
import { formatMins } from '../rooms/timerText';
import styles from './Home.module.css';

function SessionRow({ session, now }: { session: MySession; now: Date }) {
  const when = session.endedAt === null ? 'In progress' : sessionDayLabel(session.startedAt, now);
  return (
    <li className={styles.recentRow}>
      <span className={styles.recentIcon} aria-hidden="true">
        <Icon name="check" />
      </span>
      <div className={styles.recentText}>
        <b>{session.roomName}</b>
        <small>
          {when} · {peopleText(session.peopleCount)}
        </small>
      </div>
      <span className={styles.recentMins}>
        <span className="sr-only">Focused </span>
        {formatMins(session.focusedMins)}
      </span>
    </li>
  );
}

function SkeletonRows() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading your recent sessions
      </span>
      <ul className={styles.recentList} aria-hidden="true">
        {Array.from({ length: RECENT_SESSIONS_COUNT }, (_, index) => (
          <li key={index} className={styles.recentRow}>
            <Skeleton width={40} height={40} radius={10} />
            <div className={styles.recentText}>
              <Skeleton width="45%" />
              <Skeleton width="30%" height={12} />
            </div>
            <Skeleton width={48} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Your last few sessions, with any still in progress first. */
export function RecentSessions() {
  const query = useMySessions(undefined, RECENT_SESSIONS_COUNT);
  const sessions = query.data?.sessions ?? [];
  const now = new Date();

  let content;
  if (query.isPending) content = <SkeletonRows />;
  else if (query.isError) {
    content = (
      <EmptyState
        title="Couldn’t load your sessions"
        action={
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      >
        {query.error.message}
      </EmptyState>
    );
  } else if (sessions.length === 0) {
    content = (
      <EmptyState title="No sessions yet">
        Your sessions will show up here after you leave a room: focus time, rounds and goals done.
      </EmptyState>
    );
  } else {
    content = (
      <ul className={styles.recentList}>
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} now={now} />
        ))}
      </ul>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="recent-heading">
      <div className={styles.panel}>
        <div className={`${styles.sectionHead} ${styles.panelHead}`}>
          <h2 id="recent-heading">Your recent sessions</h2>
          <ButtonLink to="/progress" variant="ghost" size="sm">
            See all
          </ButtonLink>
        </div>
        {content}
      </div>
    </section>
  );
}
