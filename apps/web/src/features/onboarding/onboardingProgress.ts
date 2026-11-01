/**
 * Which onboarding step someone is on, so a refresh reopens it. The answers themselves are saved on the
 * server at each Continue; this only remembers the position. Storage can be blocked (private windows),
 * in which case onboarding starts again from step 1 with the saved answers.
 */
export const ONBOARDING_STEPS = 3;
export type OnboardingStep = 1 | 2 | 3;

const keyFor = (userId: string) => `sb-onboarding:${userId}`;

export function loadStep(userId: string): OnboardingStep {
  try {
    const stored = Number(localStorage.getItem(keyFor(userId)));
    return Number.isInteger(stored) && stored >= 1 && stored <= ONBOARDING_STEPS
      ? (stored as OnboardingStep)
      : 1;
  } catch {
    return 1;
  }
}

export function saveStep(userId: string, step: OnboardingStep) {
  try {
    localStorage.setItem(keyFor(userId), String(step));
  } catch {
    // Not fatal: see above.
  }
}

export function clearStep(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // Not fatal: see above.
  }
}
