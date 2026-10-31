import bcrypt from 'bcrypt';
import { RESET_TOKEN_TTL_MINS, type ResetPasswordData } from '@studibrowse/shared';
import { env } from '../../config/env';
import type { EmailService } from '../../lib/email';
import { logger } from '../../lib/logger';
import { User } from '../users/user.model';
import { resetTokenInvalid } from './auth.errors';
import { passwordResetEmail, resetPasswordUrl } from './passwordResetEmail';
import { PasswordResetToken } from './passwordResetToken.model';
import { RefreshToken } from './refreshToken.model';
import { generateRefreshToken, hashToken } from './tokens';

/**
 * Emails a reset link if an account uses this email, and does nothing otherwise. The caller answers
 * the same way in both cases, so the form can't be used to find out who has an account.
 * Google-only accounts get a link too: owning the inbox is enough to set a password.
 */
export async function requestPasswordReset(email: string, emailService: EmailService): Promise<void> {
  const user = await User.findOne({ email });
  if (!user) return;

  // Only the newest link works, so an older email lying around in an inbox is harmless.
  await PasswordResetToken.deleteMany({ userId: user._id });
  const token = generateRefreshToken();
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINS * 60 * 1000),
  });

  const message = passwordResetEmail(user.email, user.name, resetPasswordUrl(env.CLIENT_ORIGIN, token));
  // Not awaited: a slow or failing provider must not make known emails answer differently.
  emailService.send(message).catch((error: unknown) => {
    logger.error({ err: error, userId: user.id }, '[auth] password reset email failed');
  });
}

/** Sets a new password and signs the account out everywhere. Each link works once. */
export async function resetPassword({ token, password }: ResetPasswordData): Promise<void> {
  const now = new Date();
  // Atomic, so two requests racing with the same link can't both succeed.
  const resetToken = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
    { usedAt: now },
  );
  if (!resetToken) throw resetTokenInvalid();

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  const updated = await User.updateOne({ _id: resetToken.userId }, { passwordHash });
  if (updated.matchedCount === 0) throw resetTokenInvalid();

  await Promise.all([
    RefreshToken.deleteMany({ userId: resetToken.userId }),
    PasswordResetToken.deleteMany({ userId: resetToken.userId }),
  ]);
}
