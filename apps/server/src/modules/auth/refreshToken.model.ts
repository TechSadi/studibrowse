import { model, Schema } from 'mongoose';

/**
 * One row per refresh token ever issued. A login starts a family; each refresh marks the
 * current row used and adds the next one to the same family. Presenting a used token again
 * means it was stolen or replayed, so the whole family is deleted.
 */
const refreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  // false for "keep me logged in" off: the cookie then lasts until the browser closes.
  persistent: { type: Boolean, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
});

// MongoDB deletes rows once expiresAt passes (its TTL monitor runs about once a minute).
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
