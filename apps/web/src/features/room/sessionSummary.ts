import type { LatestSessionResponse, RoomGoal } from '@studibrowse/shared';
import { formatGoal, formatMins } from '../rooms/timerText';

export interface SummaryView {
  focused: string;
  rounds: string;
  goals: string;
  /** "10h 20m of 12h. 6-day streak kept." */
  weekly: string;
  /** "86%" */
  weeklyPercent: string;
}

/**
 * What the session summary shows. Without a session from this visit (nobody focused for a minute), the stats
 * are zero and the goals are the room's as you left it.
 */
export function summaryView(data: LatestSessionResponse, goalsWhenLeft: RoomGoal[]): SummaryView {
  const { session, week, streakDays } = data;
  const goalsDone = session ? session.goalsDone : goalsWhenLeft.filter((goal) => goal.done).length;
  const goalsTotal = session ? session.goalsTotal : goalsWhenLeft.length;
  const streak = streakDays > 0 ? ` ${streakDays}-day streak kept.` : '';
  const percent = week.goalMins > 0 ? Math.round((week.focusMins / week.goalMins) * 100) : 0;
  return {
    focused: formatMins(session?.focusedMins ?? 0),
    rounds: String(session?.roundsCompleted ?? 0),
    goals: `${goalsDone}/${goalsTotal}`,
    weekly: `${formatMins(week.focusMins)} of ${formatGoal(week.goalMins)}.${streak}`,
    weeklyPercent: `${percent}%`,
  };
}
