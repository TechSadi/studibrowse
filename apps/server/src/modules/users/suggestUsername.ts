import { USERNAME_MAX, USERNAME_MIN } from '@studibrowse/shared';
import { isUsernameAvailable } from './users.service';

const FALLBACK_BASE = 'studier';
const SUFFIX_ATTEMPTS = 5;

/** Turns an email's local part into a valid username: lowercase, only [a-z0-9_], within the length limits. */
export function usernameBase(email: string): string {
  const cleaned = (email.split('@')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX);
  if (!cleaned) return FALLBACK_BASE;
  return cleaned.length < USERNAME_MIN ? cleaned.padEnd(USERNAME_MIN, '_') : cleaned;
}

/** Adds random digits, cutting the base so the result still fits USERNAME_MAX. */
export function withSuffix(base: string, digits: number): string {
  const suffix = String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, '0');
  return base.slice(0, USERNAME_MAX - digits) + suffix;
}

/**
 * A free username for a new Google account, which the person can change later. Tries the email's
 * local part, then adds more and more random digits. The unique index still has the final say.
 */
export async function suggestUsername(email: string): Promise<string> {
  const base = usernameBase(email);
  if (await isUsernameAvailable(base)) return base;
  for (let attempt = 0; attempt < SUFFIX_ATTEMPTS; attempt++) {
    const candidate = withSuffix(base, 3 + attempt);
    if (await isUsernameAvailable(candidate)) return candidate;
  }
  return withSuffix(base, 10);
}
