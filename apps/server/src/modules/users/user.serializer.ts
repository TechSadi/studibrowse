import type { AvatarColor, PublicUser, SuggestedUser } from '@studibrowse/shared';
import type { UserDocument } from './user.model';

/**
 * The only way a user leaves the server. Copies an explicit list of fields, so a new
 * secret on the model (password hash, Google id, tokens) can't leak by accident.
 */
export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatarColor: user.avatarColor as AvatarColor,
    studying: user.studying,
    subjects: [...user.subjects],
    weeklyGoalMins: user.weeklyGoalMins,
    timerDefaults: {
      focusMins: user.timerDefaults.focusMins,
      shortBreakMins: user.timerDefaults.shortBreakMins,
      longBreakMins: user.timerDefaults.longBreakMins,
      roundsBeforeLong: user.timerDefaults.roundsBeforeLong,
      totalRounds: user.timerDefaults.totalRounds,
    },
    streak: { current: user.streak.current, longest: user.streak.longest },
    lastStudiedAt: user.lastStudiedAt?.toISOString() ?? null,
    following: user.following.map((id) => id.toString()),
    notificationPrefs: {
      roomOpened: user.notificationPrefs.roomOpened,
      roomFull: user.notificationPrefs.roomFull,
      memberJoined: user.notificationPrefs.memberJoined,
      roundEnded: user.notificationPrefs.roundEnded,
    },
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Another person as onboarding suggests them: no email, settings or following list. */
export function toSuggestedUser(user: UserDocument): SuggestedUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarColor: user.avatarColor as AvatarColor,
    studying: user.studying,
    subjects: [...user.subjects],
  };
}
