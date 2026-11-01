import type { PublicUser } from '@studibrowse/shared';
import { streakView } from '../../lib/streak';
import { Icon } from '../ui/Icon';
import styles from './StreakCard.module.css';

interface StreakCardProps {
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

export function StreakCard({ user, className }: StreakCardProps) {
  const { days, studiedToday, week } = streakView(user, new Date());
  const { title, note } = streakCopy(days, studiedToday);
  return (
    <div className={className ? `${styles.streak} ${className}` : styles.streak}>
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
