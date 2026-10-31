import {
  SUGGESTED_USERS_LIMIT,
  type FollowedUser,
  type PublicUser,
  type SuggestedUser,
  type UpdateMeData,
} from '@studibrowse/shared';
import { unauthenticated } from '../auth/auth.errors';
import { User } from './user.model';
import { toFollowedUser, toPublicUser, toSuggestedUser } from './user.serializer';
import { cannotFollowSelf, userNotFound } from './users.errors';

/** `username` must already be normalised by the shared usernameSchema. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  return !(await User.exists({ username }));
}

/** `data` must already be parsed by the shared updateMeSchema. */
export async function updateMe(userId: string, data: UpdateMeData): Promise<PublicUser> {
  const user = await User.findById(userId);
  // The token outlived the account, which is the same as not being signed in.
  if (!user) throw unauthenticated();

  const { timerDefaults, onboarded, ...fields } = data;
  user.set(fields);
  // Merge per field, so saving the focus length doesn't reset the breaks.
  for (const [field, value] of Object.entries(timerDefaults ?? {})) {
    user.set(`timerDefaults.${field}`, value);
  }
  // Keep the first timestamp: skipping and later finishing is still one onboarding.
  if (onboarded && !user.onboardedAt) user.onboardedAt = new Date();

  await user.save();
  return toPublicUser(user);
}

/** The most recently active people who finished onboarding, including ones you already follow. */
export async function listSuggestions(userId: string): Promise<SuggestedUser[]> {
  const users = await User.find({ _id: { $ne: userId }, onboardedAt: { $ne: null } })
    .sort({ lastStudiedAt: -1, updatedAt: -1 })
    .limit(SUGGESTED_USERS_LIMIT);
  return users.map(toSuggestedUser);
}

/** The people you follow, in the order you followed them. Deleted accounts are left out. */
export async function listFollowing(userId: string): Promise<FollowedUser[]> {
  const me = await User.findById(userId, { following: 1 });
  if (!me) throw unauthenticated();
  const ids = me.following.map((id) => id.toString());
  const users = await User.find({ _id: { $in: ids } });
  const byId = new Map(users.map((user) => [user.id as string, user]));
  return ids.flatMap((id) => {
    const user = byId.get(id);
    return user ? [toFollowedUser(user)] : [];
  });
}

export async function follow(userId: string, targetId: string): Promise<PublicUser> {
  if (userId === targetId) throw cannotFollowSelf();
  if (!(await User.exists({ _id: targetId }))) throw userNotFound();
  return updateFollowing(userId, { $addToSet: { following: targetId } });
}

/** Succeeds whether or not you followed them, so a double click or a deleted account is harmless. */
export async function unfollow(userId: string, targetId: string): Promise<PublicUser> {
  return updateFollowing(userId, { $pull: { following: targetId } });
}

async function updateFollowing(
  userId: string,
  update: { $addToSet: { following: string } } | { $pull: { following: string } },
): Promise<PublicUser> {
  const user = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after' });
  if (!user) throw unauthenticated();
  return toPublicUser(user);
}
