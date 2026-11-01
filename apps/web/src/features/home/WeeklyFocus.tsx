import { Link } from 'react-router';
import type { ProgressSummaryResponse } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../auth/AuthContext';
import { chartMax, dailyPace, formatDelta, goalPercent, weekDelta, weekdayOf } from '../progress/format';
import { useProgressSummary } from '../progress/queries';
import { formatMins } from '../rooms/timerText';
import { formatGoalHours, weekDays } from './dates';
import styles from './Home.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** The mockup's day columns, from the server's days (already in your time zone). */
function WeekChart({ summary }: { summary: ProgressSummaryResponse }) {
  const { days, today, week } = summary;
  const max = chartMax(days, week.goalMins);
  const empty = week.focusMins === 0;
  const label = empty
    ? 'No focus time logged this week yet'
    : `Focus time this week: ${days.map((day) => `${weekdayOf(day.date, true)} ${formatMins(day.focusMins)}`).join(', ')}`;
  // The bars stand on a 28px label strip, so the line sits that far up plus its share of the rest.
  const paceShare = dailyPace(week.goalMins) / max;

  return (
    <div className={styles.wkChart} role="img" aria-label={label}>
      {week.goalMins > 0 && !empty ? (
        <div
          className={styles.wkGoal}
          style={{ bottom: `calc(28px + (100% - 28px) * ${paceShare.toFixed(3)})` }}
        >
          <span>Daily goal</span>
        </div>
      ) : null}
      {days.map((day) => {
        const isToday = day.date === today;
        const isFuture = day.date > today;
        const has = day.focusMins > 0;
        return (
          <div
            key={day.date}
            className={cx(styles.wkCol, isToday && styles.today, isFuture && styles.future)}
            aria-hidden="true"
          >
            <div className={styles.wkArea}>
              <i
                className={has ? styles.has : undefined}
                style={has ? { height: `${(day.focusMins / max) * 100}%` } : undefined}
              >
                {isToday && has ? <b className="num">{formatMins(day.focusMins)}</b> : null}
              </i>
            </div>
            <span className={styles.wkLabel}>{weekdayOf(day.date)[0]}</span>
          </div>
        );
      })}
      {empty ? (
        <p className={styles.wkEmpty} aria-hidden="true">
          Finish a focus round to see it here.
        </p>
      ) : null}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className={styles.wkChart}>
      <span className="sr-only" role="status">
        Loading your week
      </span>
      {weekDays(new Date()).map((day) => (
        <div key={day.name} className={styles.wkCol} aria-hidden="true">
          <div className={styles.wkArea}>
            <Skeleton width="100%" height="40%" radius="7px 7px 4px 4px" className={styles.wkSkeletonBar} />
          </div>
          <span className={styles.wkLabel}>{day.label}</span>
        </div>
      ))}
    </div>
  );
}

/** This week's focus time against the weekly goal, by day, and how it compares with last week. */
export function WeeklyFocus() {
  const { state } = useAuth();
  const summary = useProgressSummary();
  const data = summary.data;
  const goalMins = data?.week.goalMins ?? state.user?.weeklyGoalMins ?? 0;
  const percent = data ? goalPercent(data.week.focusMins, goalMins) : 0;
  const delta = data ? weekDelta(data.week.focusMins, data.lastWeek.focusMins) : null;

  let chart;
  if (data) chart = <WeekChart summary={data} />;
  else if (summary.isError) {
    chart = (
      <div className={cx(styles.wkChart, styles.wkError)}>
        <p>Couldn’t load your week.</p>
        <Button variant="ghost" size="sm" onClick={() => void summary.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else chart = <ChartSkeleton />;

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
        {data ? (
          <strong className="num">{formatMins(data.week.focusMins)}</strong>
        ) : (
          <Skeleton width={120} height={40} radius={8} />
        )}
        {delta !== null ? (
          <span className={cx(styles.delta, delta < 0 && styles.deltaDown)}>
            {formatDelta(delta)} vs last week
          </span>
        ) : null}
      </div>
      <p className={styles.wkSub}>of your {formatGoalHours(goalMins)} weekly goal</p>
      {chart}
      <div className={styles.wkProgress}>
        <div className={styles.row2}>
          <span id="weekly-goal-label">Weekly goal</span>
          <b className="num">{percent}%</b>
        </div>
        <div
          className={styles.wkTrack}
          role="progressbar"
          aria-labelledby="weekly-goal-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
          aria-valuetext={`${percent}%`}
        >
          <i style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      </div>
    </section>
  );
}
