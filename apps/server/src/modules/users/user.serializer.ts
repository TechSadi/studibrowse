import type {
  AvatarColor,
  FollowedUser,
  FollowListUser,
  PublicUser,
  SuggestedUser,
} from '@studibrowse/shared';
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
    timeZone: user.timeZone,
    following: user.following.map((id) => id.toString()),
    notificationPrefs: {
      roomOpened: user.notificationPrefs.roomOpened,
      roomFull: user.notificationPrefs.roomFull,
      memberJoined: user.notificationPrefs.memberJoined,
      roundEnded: user.notificationPrefs.roundEnded,
    },
    privacy: { showStudying: user.privacy.showStudying, showStats: user.privacy.showStats },
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Their "what are you studying" line as other people see it: empty when their privacy settings hide it. */
export function visibleStudying(user: Pick<UserDocument, 'studying' | 'privacy'>): string {
  // Accounts saved before privacy settings existed have none, which means everything is shown.
  return user.privacy?.showStudying === false ? '' : user.studying;
}

/** Another person as onboarding suggests them: no email, settings or following list. */
export function toSuggestedUser(user: UserDocument): SuggestedUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarColor: user.avatarColor as AvatarColor,
    studying: visibleStudying(user),
    subjects: [...user.subjects],
  };
}

/** Someone you follow, as the sidebar lists them: just enough for an avatar and a name. */
export function toFollowedUser(user: UserDocument): FollowedUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarColor: user.avatarColor as AvatarColor,
  };
}

/** Someone in a profile's Followers or Following list. `viewerFollowing` holds the ids the viewer follows. */
export function toFollowListUser(user: UserDocument, viewerFollowing: ReadonlySet<string>): FollowListUser {
  return {
    ...toFollowedUser(user),
    studying: visibleStudying(user),
    isFollowing: viewerFollowing.has(user.id as string),
  };
}
