import { TIMER_LIMITS, WEEKLY_GOAL_OPTIONS } from '@studibrowse/shared';
import { Stepper, StepperGrid } from '../../components/ui/Stepper';
import { onRadioKeyDown } from '../../lib/radioGroup';
import type { GoalDraft } from './drafts';
import styles from './Onboarding.module.css';

interface GoalStepProps {
  draft: GoalDraft;
  onChange: (draft: GoalDraft) => void;
}

export function GoalStep({ draft, onChange }: GoalStepProps) {
  const selectedIndex = WEEKLY_GOAL_OPTIONS.findIndex((o) => o.hours * 60 === draft.weeklyGoalMins);
  const selectGoal = (index: number) =>
    onChange({ ...draft, weeklyGoalMins: WEEKLY_GOAL_OPTIONS[index]!.hours * 60 });

  return (
    <div className={styles.body}>
      <div className={styles.goalPick} role="radiogroup" aria-label="Weekly focus goal">
        {WEEKLY_GOAL_OPTIONS.map(({ hours, label }, index) => {
          const checked = index === selectedIndex;
          // With no match (a goal set elsewhere), the first card is still reachable by Tab.
          const focusable = checked || (selectedIndex === -1 && index === 0);
          return (
            <button
              key={hours}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={focusable ? 0 : -1}
              className={checked ? styles.on : undefined}
              onClick={() => selectGoal(index)}
              onKeyDown={(e) => onRadioKeyDown(e, index, WEEKLY_GOAL_OPTIONS.length, selectGoal)}
            >
              <b>{hours}h</b>
              <small>{label}</small>
            </button>
          );
        })}
      </div>
      <div className={styles.timerSet}>
        <span className={styles.lbl}>Your default timer for new rooms</span>
        <StepperGrid>
          <Stepper
            label="Focus"
            unit="m"
            value={draft.focusMins}
            onChange={(focusMins) => onChange({ ...draft, focusMins })}
            {...TIMER_LIMITS.focusMins}
          />
          <Stepper
            label="Break"
            unit="m"
            value={draft.shortBreakMins}
            onChange={(shortBreakMins) => onChange({ ...draft, shortBreakMins })}
            {...TIMER_LIMITS.shortBreakMins}
          />
          <Stepper
            label="Rounds"
            value={draft.totalRounds}
            onChange={(totalRounds) => onChange({ ...draft, totalRounds })}
            {...TIMER_LIMITS.totalRounds}
          />
        </StepperGrid>
      </div>
    </div>
  );
}
