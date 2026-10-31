import type { AvatarColor, PublicUser, UpdateMeInput } from '@studibrowse/shared';

/** Step 1's answers, edited locally until Continue saves them. */
export interface ProfileDraft {
  avatarColor: AvatarColor;
  studying: string;
  subjects: string[];
}

/** Step 2's answers. Onboarding only shows focus, short break and rounds; the rest keep their defaults. */
export interface GoalDraft {
  weeklyGoalMins: number;
  focusMins: number;
  shortBreakMins: number;
  totalRounds: number;
}

export function profileDraftOf(user: PublicUser): ProfileDraft {
  return { avatarColor: user.avatarColor, studying: user.studying, subjects: [...user.subjects] };
}

export function goalDraftOf(user: PublicUser): GoalDraft {
  const { focusMins, shortBreakMins, totalRounds } = user.timerDefaults;
  return { weeklyGoalMins: user.weeklyGoalMins, focusMins, shortBreakMins, totalRounds };
}

export function goalPayload({ weeklyGoalMins, ...timerDefaults }: GoalDraft): UpdateMeInput {
  return { weeklyGoalMins, timerDefaults };
}
