// The opaque cursor of GET /api/notifications: where the last page stopped. Pure.

/** A notification's place in the list: newest `createdAt` first, then highest `_id` to break ties. */
export interface NotificationPosition {
  createdAt: Date;
  id: string;
}

const MAX_DATE_MS = 8.64e15;
const OBJECT_ID = /^[a-f0-9]{24}$/;

export function encodeNotificationCursor({ createdAt, id }: NotificationPosition): string {
  return Buffer.from(JSON.stringify({ t: createdAt.getTime(), id })).toString('base64url');
}

/** The position in a cursor, or null if it isn't one we made. */
export function decodeNotificationCursor(cursor: string): NotificationPosition | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null) return null;
    const { t, id } = value as Record<string, unknown>;
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > MAX_DATE_MS) return null;
    if (typeof id !== 'string' || !OBJECT_ID.test(id)) return null;
    return { createdAt: new Date(t), id };
  } catch {
    return null;
  }
}
