// The opaque cursor of GET /api/sessions/mine: where the last page of finished sessions stopped. Pure.

/** A finished session's place in history: newest `endedAt` first, then highest `_id` to break ties. */
export interface SessionPosition {
  endedAt: Date;
  id: string;
}

// The latest time a Date can hold. Every finished session comes before it, so it starts the finished list.
const MAX_DATE_MS = 8.64e15;
const OBJECT_ID = /^[a-f0-9]{24}$/;

/** Before every finished session: page one uses it, and so does the page after one full of in-progress ones. */
export const FINISHED_START: SessionPosition = { endedAt: new Date(MAX_DATE_MS), id: 'f'.repeat(24) };

export function encodeSessionCursor({ endedAt, id }: SessionPosition): string {
  return Buffer.from(JSON.stringify({ t: endedAt.getTime(), id })).toString('base64url');
}

/** The position in a cursor, or null if it isn't one we made. */
export function decodeSessionCursor(cursor: string): SessionPosition | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null) return null;
    const { t, id } = value as Record<string, unknown>;
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > MAX_DATE_MS) return null;
    if (typeof id !== 'string' || !OBJECT_ID.test(id)) return null;
    return { endedAt: new Date(t), id };
  } catch {
    return null;
  }
}
