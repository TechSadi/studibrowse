import type { PresenceMember, RoomGoal } from '@studibrowse/shared';
import { Icon } from '../../components/ui/Icon';
import styles from './panes.module.css';
import { firstName } from './people';

interface GoalsPanelProps {
  goals: RoomGoal[];
  members: PresenceMember[];
  myUserId: string;
}

/**
 * The Goals tab (mockup `data-pane="goals"`). Shows the room's goals and progress; adding and ticking them
 * from here arrives with Phase 3. Until then the host edits them in Room settings.
 */
export function GoalsPanel({ goals, members, myUserId }: GoalsPanelProps) {
  const done = goals.filter((goal) => goal.done).length;
  const names = new Map(members.map((member) => [member.userId, firstName(member.name)]));
  const addedBy = (userId: string) =>
    userId === myUserId ? 'you' : (names.get(userId) ?? 'someone who left');

  return (
    <div className={styles.scroll}>
      {goals.length === 0 ? (
        <p className="muted">No goals yet. The host can add goals for the room in Room settings.</p>
      ) : (
        <>
          <div className={styles.goalProgress}>
            <span>Room goals for this session</span>
            <b className="num">
              {done} of {goals.length} done
            </b>
          </div>
          <div
            className={styles.barTrack}
            role="progressbar"
            aria-label="Room goals done"
            aria-valuemin={0}
            aria-valuemax={goals.length}
            aria-valuenow={done}
          >
            <i style={{ width: `${(done / goals.length) * 100}%` }} />
          </div>
          <ul className={styles.goals}>
            {goals.map((goal) => (
              <li key={goal.id} className={goal.done ? `${styles.goal} ${styles.done}` : styles.goal}>
                <span className={styles.box} aria-hidden="true">
                  <Icon name="check" />
                </span>
                <span>
                  <b>
                    {goal.text}
                    {goal.done ? <span className="sr-only"> (done)</span> : null}
                  </b>
                  <small>Added by {addedBy(goal.addedBy)}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
