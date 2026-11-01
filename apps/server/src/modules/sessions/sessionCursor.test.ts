import { describe, expect, it } from 'vitest';
import { decodeSessionCursor, encodeSessionCursor, FINISHED_START } from './sessionCursor';

const position = { endedAt: new Date('2026-10-29T18:00:00Z'), id: '65f1c0ffee0000000000abcd' };

describe('session cursors', () => {
  it('give back the position they were made from', () => {
    expect(decodeSessionCursor(encodeSessionCursor(position))).toEqual(position);
    expect(decodeSessionCursor(encodeSessionCursor(FINISHED_START))).toEqual(FINISHED_START);
  });

  it('are safe to put in a URL', () => {
    expect(encodeSessionCursor(position)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64 JSON', 'nope'],
    ['JSON that isn’t an object', Buffer.from('42').toString('base64url')],
    ['a bad id', Buffer.from(JSON.stringify({ t: 1, id: 'x' })).toString('base64url')],
    [
      'a time that isn’t whole',
      Buffer.from(JSON.stringify({ t: 1.5, id: position.id })).toString('base64url'),
    ],
    ['a negative time', Buffer.from(JSON.stringify({ t: -1, id: position.id })).toString('base64url')],
    ['no time', Buffer.from(JSON.stringify({ id: position.id })).toString('base64url')],
  ])('reject %s', (_, cursor) => {
    expect(decodeSessionCursor(cursor)).toBeNull();
  });
});
