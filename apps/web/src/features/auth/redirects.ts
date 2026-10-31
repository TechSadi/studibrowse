import type { PublicUser } from '@studibrowse/shared';

/** Pages only signed-out visitors see; signed-in users are sent on from these. */
export const PUBLIC_ONLY_PATHS = ['/', '/signup', '/login', '/forgot-password'];

/**
 * Accepts a `next` path only if it stays on this site. Rejects absolute and protocol-relative URLs
 * (open-redirect protection) and public-only pages (which would just redirect again).
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  const pathname = next.split(/[?#]/, 1)[0] ?? '';
  return PUBLIC_ONLY_PATHS.includes(pathname) ? null : next;
}

/** Where a user lands after signing in: onboarding until it's finished, then `next` or Home. */
export function resolveSignedInPath(user: Pick<PublicUser, 'onboardedAt'>, next?: string | null): string {
  const safeNext = safeNextPath(next);
  if (!user.onboardedAt) return safeNext ? `/onboarding?next=${encodeURIComponent(safeNext)}` : '/onboarding';
  return safeNext ?? '/home';
}

export function loginPathFor(location: { pathname: string; search: string }): string {
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}
