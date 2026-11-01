import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { PublicUser, UpdateMeInput } from '@studibrowse/shared';
import { Brand } from '../../components/ui/Brand';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { usersApi } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { goalDraftOf, goalPayload, profileDraftOf } from './drafts';
import { FollowStep } from './FollowStep';
import { GoalStep } from './GoalStep';
import styles from './Onboarding.module.css';
import { clearStep, loadStep, ONBOARDING_STEPS, saveStep, type OnboardingStep } from './onboardingProgress';
import { ProfileStep } from './ProfileStep';

const STEP_COPY: Record<OnboardingStep, { title: string; sub: string }> = {
  1: { title: 'Set up your profile', sub: 'This is what people see next to your name in a room.' },
  2: {
    title: 'Pick a weekly focus goal',
    sub: 'We’ll track it on your Progress page. You can change it any time.',
  },
  3: { title: 'Follow a few people', sub: 'You’ll get a notification when someone you follow opens a room.' },
};

export function OnboardingPage() {
  const { state } = useAuth();
  // RequireAuth only renders this page for a signed-in user.
  if (!state.user) return null;
  return <OnboardingFlow user={state.user} />;
}

function OnboardingFlow({ user }: { user: PublicUser }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<OnboardingStep>(() => loadStep(user.id));
  // Drafts live here, not in the steps, so Back and Continue keep unsaved edits.
  const [profile, setProfile] = useState(() => profileDraftOf(user));
  const [goal, setGoal] = useState(() => goalDraftOf(user));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);

  const save = useMutation({
    mutationFn: (input: UpdateMeInput) => usersApi.updateMe(input),
    onSuccess: ({ user: updated }, input) => {
      // Done here rather than in finish()'s mutate callbacks: setUser makes the onboarding route guard
      // navigate away, and per-call callbacks don't run once the page has unmounted.
      if (input.onboarded) {
        clearStep(user.id);
        toast({ icon: 'check', title: 'You’re all set', detail: 'Pick a room or open your own' });
      }
      setUser(updated);
    },
  });

  // Move focus to the new step's heading so keyboard and screen reader users know the step changed.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function goTo(next: OnboardingStep) {
    save.reset();
    setStep(next);
    saveStep(user.id, next);
  }

  // Once onboardedAt is set, the onboarding route guard sends the user on to `next` or Home.
  function finish() {
    save.mutate({ onboarded: true });
  }

  function next() {
    if (step === 1) save.mutate(profile, { onSuccess: () => goTo(2) });
    else if (step === 2) save.mutate(goalPayload(goal), { onSuccess: () => goTo(3) });
    else finish();
  }

  const copy = STEP_COPY[step];
  return (
    <div className={styles.onb}>
      <div className={styles.top}>
        <Brand />
        <div className={styles.steps} role="img" aria-label={`Step ${step} of ${ONBOARDING_STEPS}`}>
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? styles.stepOn : undefined} />
          ))}
        </div>
      </div>
      <main className={styles.card}>
        <div className="eyebrow">
          Step {step} of {ONBOARDING_STEPS}
        </div>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {copy.title}
        </h1>
        <p className={styles.sub}>{copy.sub}</p>

        {step === 1 ? <ProfileStep name={user.name} draft={profile} onChange={setProfile} /> : null}
        {step === 2 ? <GoalStep draft={goal} onChange={setGoal} /> : null}
        {step === 3 ? <FollowStep /> : null}

        <FormError>{save.error?.message}</FormError>

        <div className={styles.foot}>
          {step > 1 ? (
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => goTo((step - 1) as OnboardingStep)}
            >
              Back
            </Button>
          ) : null}
          <button
            type="button"
            className={`text-link ${styles.skip}`}
            disabled={save.isPending}
            onClick={finish}
          >
            Skip for now
          </button>
          <Button className={styles.next} disabled={save.isPending} onClick={next}>
            {step === ONBOARDING_STEPS ? 'Start studying' : 'Continue'}
            <Icon name="arrow" />
          </Button>
        </div>
      </main>
    </div>
  );
}
