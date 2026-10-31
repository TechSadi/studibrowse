import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { mongo } from 'mongoose';
import type { LoginData, PublicUser, SignupData } from '@studibrowse/shared';
import { env } from '../../config/env';
import { User, type UserDocument } from '../users/user.model';
import { toPublicUser } from '../users/user.serializer';
import {
  emailTaken,
  invalidCredentials,
  refreshTokenReused,
  unauthenticated,
  usernameTaken,
} from './auth.errors';
import { RefreshToken } from './refreshToken.model';
import { generateRefreshToken, hashToken, signAccessToken } from './tokens';

export interface Session {
  accessToken: string;
  /** Raw token for the cookie. Never put it in a response body. */
  refreshToken: string;
  persistent: boolean;
  user: PublicUser;
}

const DAY_MS = 24 * 60 * 60 * 1000;

let dummyHash: Promise<string> | undefined;

/** Compared against when no account matches, so a login takes as long whether or not the account exists. */
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('no-account-has-this-password-1', env.BCRYPT_COST);
  return dummyHash;
}

async function startSession(
  user: UserDocument,
  persistent: boolean,
  familyId: string = randomUUID(),
): Promise<Session> {
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    userId: user._id,
    familyId,
    tokenHash: hashToken(refreshToken),
    persistent,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
  });
  return { accessToken: signAccessToken(user.id), refreshToken, persistent, user: toPublicUser(user) };
}

/** Maps a unique-index violation (two sign-ups racing for the same email or username) to a 409. */
function duplicateKeyError(error: unknown, username: string) {
  if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) return undefined;
  const keys = Object.keys((error.keyPattern as Record<string, unknown> | undefined) ?? {});
  if (keys.includes('email')) return emailTaken();
  if (keys.includes('username')) return usernameTaken(username);
  return undefined;
}

export async function signup(input: SignupData): Promise<Session> {
  const [emailExists, usernameExists] = await Promise.all([
    User.exists({ email: input.email }),
    User.exists({ username: input.username }),
  ]);
  if (emailExists) throw emailTaken();
  if (usernameExists) throw usernameTaken(input.username);

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);
  let user: UserDocument;
  try {
    user = await User.create({
      name: input.name,
      username: input.username,
      email: input.email,
      passwordHash,
    });
  } catch (error) {
    throw duplicateKeyError(error, input.username) ?? error;
  }
  return startSession(user, input.keepLoggedIn);
}

export async function login(input: LoginData): Promise<Session> {
  const query = input.identifier.includes('@') ? { email: input.identifier } : { username: input.identifier };
  const user = await User.findOne(query).select('+passwordHash');
  // Google-only accounts have no password, so they fail here like an unknown account.
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user?.passwordHash || !matches) throw invalidCredentials();
  return startSession(user, input.keepLoggedIn);
}

/** Swaps a refresh token for a new one in the same family. Each token works exactly once. */
export async function refresh(rawToken: string | undefined): Promise<Session> {
  if (!rawToken) throw unauthenticated();
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Atomic, so two requests racing with the same token can't both succeed.
  const current = await RefreshToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { usedAt: now },
  );
  if (!current) {
    const stale = await RefreshToken.findOne({ tokenHash });
    if (stale?.usedAt) {
      await RefreshToken.deleteMany({ familyId: stale.familyId });
      throw refreshTokenReused();
    }
    throw unauthenticated();
  }

  const user = await User.findById(current.userId);
  if (!user) {
    await RefreshToken.deleteMany({ familyId: current.familyId });
    throw unauthenticated();
  }
  return startSession(user, current.persistent, current.familyId);
}

/** Ends the session the token belongs to. Safe to call with a missing or unknown token. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const token = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (token) await RefreshToken.deleteMany({ familyId: token.familyId });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) throw unauthenticated();
  return toPublicUser(user);
}
