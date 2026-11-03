import { useEffect, useRef, useState } from 'react';
import {
  TIMER_LIMITS,
  WEEKLY_GOAL_MAX_MINS,
  WEEKLY_GOAL_MIN_MINS,
  type PublicUser,
  type UpdateMeInput,
} from '@studibrowse/shared';
import { Stepper, StepperGrid } from '../../components/ui/Stepper';
import styles from './Settings.module.css';
import { SettingRow, SettingsSection } from './SettingsLayout';
import { useMe, useSaveMe } from './useSaveMe';

/** Steppers save once clicking stops, so tapping + five times is one request and one toast. */
export const TIMER_SAVE_DELAY_MS = 600;

interface Draft {
  focusMins: number;
  shortBreakMins: number;
  totalRounds: number;
  weeklyGoalHours: number;
}

function draftOf(user: PublicUser): Draft {
  return {
    focusMins: user.timerDefaults.focusMins,
    shortBreakMins: user.timerDefaults.shortBreakMins,
    totalRounds: user.timerDefaults.totalRounds,
    weeklyGoalHours: Math.round(user.weeklyGoalMins / 60),
  };
}

/** What changed between the saved settings and the draft, as a PATCH body (empty when nothing did). */
function changesOf(saved: Draft, draft: Draft): UpdateMeInput {
  const timerDefaults: NonNullable<UpdateMeInput['timerDefaults']> = {};
  if (draft.focusMins !== saved.focusMins) timerDefaults.focusMins = draft.focusMins;
  if (draft.shortBreakMins !== saved.shortBreakMins) timerDefaults.shortBreakMins = draft.shortBreakMins;
  if (draft.totalRounds !== saved.totalRounds) timerDefaults.totalRounds = draft.totalRounds;
  return {
    ...(Object.keys(timerDefaults).length > 0 && { timerDefaults }),
    ...(draft.weeklyGoalHours !== saved.weeklyGoalHours && { weeklyGoalMins: draft.weeklyGoalHours * 60 }),
  };
}

export function TimerDefaultsSection({ id }: { id: string }) {
  const user = useMe();
  const save = useSaveMe();
  const [draft, setDraft] = useState(() => draftOf(user));
  // The save waiting for clicks to stop, so it can run straight away if you leave the page first.
  const pendingSave = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

  useEffect(
    () => () => {
      const pending = pendingSave.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.run();
    },
    [],
  );

  const commit = (saved: Draft, next: Draft) => {
    pendingSave.current = null;
    const changes = changesOf(saved, next);
    if (Object.keys(changes).length === 0) return;
    const title = changes.timerDefaults ? 'Timer defaults saved' : 'Weekly goal saved';
    const detail = changes.timerDefaults
      ? `${next.focusMins}m focus, ${next.shortBreakMins}m break, ${next.totalRounds} rounds`
      : `${next.weeklyGoalHours}h a week`;
    void save(changes, { icon: changes.timerDefaults ? 'target' : 'chart', title, detail }).then((ok) => {
      // Show the saved values again if the server refused.
      if (!ok) setDraft(saved);
    });
  };

  const change = (field: keyof Draft, value: number) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (pendingSave.current) clearTimeout(pendingSave.current.timer);
    const saved = draftOf(user);
    const run = () => commit(saved, next);
    pendingSave.current = { timer: setTimeout(run, TIMER_SAVE_DELAY_MS), run };
  };

  return (
    <SettingsSection
      id={id}
      title="Timer defaults"
      description="Used when you create a new room. You can still change them per room."
    >
      <StepperGrid>
        <Stepper
          label="Focus"
          unit="m"
          value={draft.focusMins}
          onChange={(value) => change('focusMins', value)}
          {...TIMER_LIMITS.focusMins}
        />
        <Stepper
          label="Short break"
          unit="m"
          value={draft.shortBreakMins}
          onChange={(value) => change('shortBreakMins', value)}
          {...TIMER_LIMITS.shortBreakMins}
        />
        <Stepper
          label="Rounds"
          value={draft.totalRounds}
          onChange={(value) => change('totalRounds', value)}
          {...TIMER_LIMITS.totalRounds}
        />
      </StepperGrid>
      <SettingRow title="Weekly focus goal" hint="Shown on Home and Progress" className={styles.goalRow}>
        <div className={styles.goalStepper}>
          <Stepper
            label="Weekly focus goal"
            hideLabel
            unit="h"
            value={draft.weeklyGoalHours}
            onChange={(value) => change('weeklyGoalHours', value)}
            min={WEEKLY_GOAL_MIN_MINS / 60}
            max={WEEKLY_GOAL_MAX_MINS / 60}
            step={1}
          />
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
