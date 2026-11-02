import { describe, expect, it } from 'vitest';
import { decodeNotificationCursor, encodeNotificationCursor } from './notificationCursor';

describe('notification cursor', () => {
  it('round-trips a position', () => {
    const position = { createdAt: new Date('2026-11-02T10:00:00Z'), id: '65f1c0ffee0000000000abcd' };
    expect(decodeNotificationCursor(encodeNotificationCursor(position))).toEqual(position);
  });

  it.each([
    ['not base64 json', 'nope'],
    ['a bad id', Buffer.from(JSON.stringify({ t: 1, id: 'x' })).toString('base64url')],
    ['a bad time', Buffer.from(JSON.stringify({ t: -1, id: 'a'.repeat(24) })).toString('base64url')],
  ])('rejects %s', (_, cursor) => {
    expect(decodeNotificationCursor(cursor)).toBeNull();
  });
});
