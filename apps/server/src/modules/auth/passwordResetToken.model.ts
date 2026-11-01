import { model, Schema } from 'mongoose';

/** A single-use password reset link. Only the token's hash is stored; the raw token is in the email. */
const passwordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
});

// MongoDB deletes rows once expiresAt passes. Lookups still check expiresAt, since the TTL monitor lags.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = model('PasswordResetToken', passwordResetTokenSchema);
