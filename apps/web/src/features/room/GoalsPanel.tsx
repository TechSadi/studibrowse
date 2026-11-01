import { useState, type FormEvent } from 'react';
import { GOAL_TEXT_MAX, MAX_GOALS, type PresenceMember } from '@studibrowse/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import type { ShownGoal } from './goals/pendingGoals';
import type { RoomGoals } from './goals/useRoomGoals';
import styles from './panes.module.css';
import { firstName } from './people';

interface GoalsPanelProps {
  roomGoals: RoomGoals;
  members: PresenceMember[];
  myUserId: string;
  /** The host can remove anyone's goal. */
  isHost: boolean;
}

const LIMIT_TOAST = {
  icon: 'target',
  title: 'Goal limit reached',
  detail: `A room can have up to ${MAX_GOALS} goals.`,
} as const;

/**
 * The Goals tab (mockup `data-pane="goals"`): the room's goals and progress. Anyone in the room can add and
 * tick goals; the author or the host can remove one. Changes show straight away and roll back if refused.
 */
export function GoalsPanel({ roomGoals, members, myUserId, isHost }: GoalsPanelProps) {
  const { goals, add, toggle, remove } = roomGoals;
  const toast = useToast();
  const [draft, setDraft] = useState('');

  const done = goals.filter((goal) => goal.done).length;
  const names = new Map(members.map((member) => [member.userId, firstName(member.name)]));
  const addedBy = (userId: string) =>
    userId === myUserId ? 'you' : (names.get(userId) ?? 'someone who left');

  function refused(err: unknown) {
    const detail = err instanceof Error ? err.message : 'Something went wrong. Try again.';
    toast({ icon: 'target', title: 'That didn’t go through', detail });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (goals.length >= MAX_GOALS) {
      toast(LIMIT_TOAST);
      return;
    }
    setDraft('');
    add(text).catch((err: unknown) => {
      // Give the text back, unless they've started typing another goal.
      setDraft((current) => current || text);
      refused(err);
    });
  }

  const canRemove = (goal: ShownGoal) => !goal.pending && (isHost || goal.addedBy === myUserId);

  return (
    <>
      <div className={styles.scroll}>
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
          <i style={{ width: goals.length ? `${(done / goals.length) * 100}%` : '0%' }} />
        </div>
        {goals.length === 0 ? (
          <p className={`muted ${styles.goalsEmpty}`}>
            No goals yet. Add one so the room knows what it’s working toward.
          </p>
        ) : (
          <ul className={styles.goals} aria-label="Room goals">
            {goals.map((goal) => (
              <li
                key={goal.id}
                className={[styles.goal, goal.done && styles.done, goal.pending && styles.pending]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  className={styles.toggle}
                  aria-pressed={goal.done}
                  disabled={goal.pending}
                  onClick={() => toggle(goal.id).catch(refused)}
                >
                  <span className={styles.box} aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  <span>
                    <b>{goal.text}</b>
                    <small>Added by {addedBy(goal.addedBy)}</small>
                  </span>
                </button>
                {canRemove(goal) ? (
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove goal: ${goal.text}`}
                    onClick={() => remove(goal.id).catch(refused)}
                  >
                    <Icon name="x" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.foot}>
        <form className={styles.inlineForm} onSubmit={onSubmit}>
          <input
            className={styles.field}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a goal for the room"
            aria-label="New goal"
            autoComplete="off"
            maxLength={GOAL_TEXT_MAX}
          />
          <Button type="submit" size="sm" className={styles.addBtn}>
            Add
          </Button>
        </form>
      </div>
    </>
  );
}
