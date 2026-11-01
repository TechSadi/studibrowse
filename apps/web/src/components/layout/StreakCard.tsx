import type { PublicUser } from '@studibrowse/shared';
import { useProgressSummary } from '../../features/progress/queries';
import { streakFromUser, streakView } from '../../lib/streak';
import { Icon } from '../ui/Icon';
import { Skeleton } from '../ui/Skeleton';
import styles from './StreakCard.module.css';

interface StreakCardProps {
  /** The signed-in user, for when the progress summary can't load. */
  user: Pick<PublicUser, 'streak' | 'lastStudiedAt'>;
  className?: string;
}

function streakCopy(days: number, studiedToday: boolean): { title: string; note: string } {
  if (days === 0) return { title: 'No streak yet', note: 'Finish a focus round to start one.' };
  const title = `${days}-day streak`;
  return studiedToday
    ? { title, note: 'You studied today. Nice work.' }
    : { title, note: 'One session today keeps it going.' };
}

/** The sidebar streak card, from the progress summary so it's counted in your time zone and stays current. */
export function StreakCard({ user, className }: StreakCardProps) {
  const summary = useProgressSummary();
  const classes = className ? `${styles.streak} ${className}` : styles.streak;

  if (summary.isPending) {
    return (
      <div className={classes}>
        <span className="sr-only" role="status">
          Loading your streak
        </span>
        <div className={styles.top} aria-hidden="true">
          <span className={styles.flame}>
            <Icon name="flame" />
          </span>
          <Skeleton width="60%" />
        </div>
        <Skeleton width="85%" height={12} className={styles.noteSkeleton} />
        <Skeleton height={5} radius={3} />
      </div>
    );
  }

  const { days, studiedToday, week } = streakView(summary.data?.streak ?? streakFromUser(user, new Date()));
  const { title, note } = streakCopy(days, studiedToday);
  return (
    <div className={classes}>
      <div className={styles.top}>
        <span className={styles.flame}>
          <Icon name="flame" />
        </span>
        <b>{title}</b>
      </div>
      <p>{note}</p>
      <div className={styles.week} aria-hidden="true">
        {week.map((on, index) => (
          <i key={index} className={on ? undefined : styles.off} />
        ))}
      </div>
    </div>
  );
}
