import type { ProgressSummaryResponse } from '@studibrowse/shared';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../auth/AuthContext';
import { formatGoal, formatMins } from '../rooms/timerText';
import { FocusByDayChart } from './FocusByDayChart';
import { goalPercent, longestStreakText, rangeLabel, sessionsNote, toGoalText } from './format';
import styles from './Progress.module.css';
import { useProgressSummary } from './queries';
import { SessionHistory } from './SessionHistory';

function Tiles({ summary }: { summary: ProgressSummaryResponse }) {
  const { week, streak } = summary;
  const percent = goalPercent(week.focusMins, week.goalMins);
  return (
    <div className={styles.tiles}>
      <div className={styles.tile}>
        <div className="eyebrow" id="tile-week">
          This week
        </div>
        <div className={`${styles.value} num`}>
          {formatMins(week.focusMins)} <small>/ {formatGoal(week.goalMins)}</small>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-labelledby="tile-week"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
          aria-valuetext={`${percent}% of your weekly goal`}
        >
          <i style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <p>{toGoalText(week.focusMins, week.goalMins)}</p>
      </div>
      <div className={styles.tile}>
        <div className="eyebrow">Streak</div>
        <div className={`${styles.value} ${styles.streak} num`}>
          {streak.current} <small>{streak.current === 1 ? 'day' : 'days'}</small>
        </div>
        <p>{longestStreakText(streak.longest)}</p>
      </div>
      <div className={styles.tile}>
        <div className="eyebrow">Sessions</div>
        <div className={`${styles.value} num`}>
          {week.sessions} <small>this week</small>
        </div>
        <p>{sessionsNote(week)}</p>
      </div>
    </div>
  );
}

function TilesSkeleton() {
  return (
    <div className={styles.tiles}>
      {['This week', 'Streak', 'Sessions'].map((name) => (
        <div key={name} className={`${styles.tile} ${styles.tileSkeleton}`}>
          <span className="eyebrow">{name}</span>
          <Skeleton width="55%" height={36} radius={8} />
          <Skeleton width="80%" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  const heights = ['45%', '70%', '35%', '80%', '25%', '10%', '10%'];
  return (
    <div className={styles.chartSkeleton}>
      {heights.map((height, index) => (
        <Skeleton key={index} height={height} radius="10px 10px 4px 4px" />
      ))}
    </div>
  );
}

/** Your progress (mockup `#progress`): this week against your goal, your streak, sessions, by day, history. */
export function ProgressPage() {
  const { state } = useAuth();
  const summary = useProgressSummary();
  const goalMins = summary.data?.week.goalMins ?? state.user?.weeklyGoalMins ?? 0;

  let overview;
  if (summary.isPending) {
    overview = (
      <>
        <span className="sr-only" role="status">
          Loading your progress
        </span>
        <TilesSkeleton />
        <section className={styles.panel} aria-label="Focus time by day">
          <div className={styles.panelHead}>
            <h2>Focus time by day</h2>
          </div>
          <ChartSkeleton />
        </section>
      </>
    );
  } else if (summary.isError) {
    overview = (
      <section className={styles.panel} aria-label="This week">
        <EmptyState
          title="Couldn’t load your progress"
          action={
            <Button variant="ghost" size="sm" onClick={() => void summary.refetch()}>
              Try again
            </Button>
          }
        >
          {summary.error.message}
        </EmptyState>
      </section>
    );
  } else {
    const data = summary.data;
    overview = (
      <>
        <Tiles summary={data} />
        <section className={styles.panel} aria-labelledby="chart-heading">
          <div className={styles.panelHead}>
            <h2 id="chart-heading">Focus time by day</h2>
            <p>{rangeLabel(data.days)}</p>
          </div>
          <FocusByDayChart days={data.days} today={data.today} goalMins={data.week.goalMins} />
        </section>
      </>
    );
  }

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>Your progress</h1>
          <p>Every session you finish in any room is counted here.</p>
        </div>
        {goalMins > 0 ? (
          <ButtonLink to="/settings" variant="ghost">
            Weekly goal: {formatGoal(goalMins)}
          </ButtonLink>
        ) : null}
      </div>
      {overview}
      <SessionHistory />
    </>
  );
}
