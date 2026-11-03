import type { DeleteAccountData } from '@studibrowse/shared';
import { unauthenticated } from '../auth/auth.errors';
import { PasswordResetToken } from '../auth/passwordResetToken.model';
import { RefreshToken } from '../auth/refreshToken.model';
import { Message } from '../chat/message.model';
import { Notification } from '../notifications/notification.model';
import { User } from './user.model';
import { confirmationMismatch } from './users.errors';

/**
 * Deletes the account: its sessions, its place in everyone's following list, its notifications, and the
 * user itself. Chat messages stay in their rooms without an author. Study sessions stay in other people's
 * history (the spec keeps the session log), and rooms it hosted already drop out once the host is gone.
 *
 * The user document goes last, so if anything fails part-way the person can still try again (their
 * access token works until it expires).
 */
export async function deleteAccount(userId: string, { username }: DeleteAccountData): Promise<void> {
  const user = await User.findById(userId, { username: 1 });
  if (!user) throw unauthenticated();
  if (user.username !== username) throw confirmationMismatch();

  await Promise.all([RefreshToken.deleteMany({ userId }), PasswordResetToken.deleteMany({ userId })]);
  await User.updateMany({ following: userId }, { $pull: { following: userId } });
  await Notification.deleteMany({ userId });
  await Message.updateMany({ userId }, { $set: { userId: null } });
  await User.deleteOne({ _id: userId });
}
