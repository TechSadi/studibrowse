// The opaque cursors of a profile's Followers and Following lists. Pure.

const OBJECT_ID = /^[a-f0-9]{24}$/;

/** Followers are listed by highest `_id` first; the cursor is the last id on the page. */
export function encodeFollowersCursor(lastId: string): string {
  return Buffer.from(JSON.stringify({ id: lastId })).toString('base64url');
}

/** Following is listed by position in the `following` array; the cursor is how many came before. */
export function encodeFollowingCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ at: offset })).toString('base64url');
}

function decode(cursor: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The last id in a followers cursor, or null if it isn't one we made. */
export function decodeFollowersCursor(cursor: string): string | null {
  const id = decode(cursor)?.id;
  return typeof id === 'string' && OBJECT_ID.test(id) ? id : null;
}

/** The offset in a following cursor, or null if it isn't one we made. */
export function decodeFollowingCursor(cursor: string): number | null {
  const at = decode(cursor)?.at;
  return typeof at === 'number' && Number.isInteger(at) && at > 0 ? at : null;
}
