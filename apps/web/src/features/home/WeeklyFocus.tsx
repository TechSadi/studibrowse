import { Link } from 'react-router';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../auth/AuthContext';
import { formatGoalHours, weekDays } from './dates';
import styles from './Home.module.css';

/** This week's focus time against the weekly goal. Sessions aren't logged yet, so it starts empty. */
export function WeeklyFocus() {
  const { state } = useAuth();
  const goalMins = state.user?.weeklyGoalMins ?? 0;
  const days = weekDays(new Date());

  return (
    <section className={styles.weekly} aria-labelledby="weekly-heading">
      <div className={styles.wkHead}>
        <h2 id="weekly-heading">Your focus this week</h2>
        <Link to="/progress" className={styles.wkSelect}>
          Last 7 days
          <Icon name="arrow" />
        </Link>
      </div>
      <div className={styles.wkTotal}>
        <strong className="num">0m</strong>
      </div>
      <p className={styles.wkSub}>of your {formatGoalHours(goalMins)} weekly goal</p>
      <div className={styles.wkChart} role="img" aria-label="No focus time logged this week yet">
        {days.map((day) => (
          <div
            key={day.name}
            className={[styles.wkCol, day.isToday && styles.today].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            <div className={styles.wkArea}>
              <i />
            </div>
            <span className={styles.wkLabel}>{day.label}</span>
          </div>
        ))}
        <p className={styles.wkEmpty} aria-hidden="true">
          Finish a focus round to see it here.
        </p>
      </div>
      <div className={styles.wkProgress}>
        <div className={styles.row2}>
          <span id="weekly-goal-label">Weekly goal</span>
          <b className="num">0%</b>
        </div>
        <div
          className={styles.wkTrack}
          role="progressbar"
          aria-labelledby="weekly-goal-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <i style={{ width: '0%' }} />
        </div>
      </div>
    </section>
  );
}
