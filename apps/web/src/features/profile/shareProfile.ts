export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** The link to someone's profile on this site. */
export function profileUrl(username: string, origin = window.location.origin): string {
  return `${origin}/u/${encodeURIComponent(username)}`;
}

/**
 * Opens the device's share sheet where there is one (phones), otherwise copies the link. Closing the share
 * sheet is 'cancelled', not an error.
 */
export async function shareProfile(name: string, url: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `${name} on StudiBrowse`, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Some browsers refuse share() outside a secure context; copying still works.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
