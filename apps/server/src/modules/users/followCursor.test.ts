import { describe, expect, it } from 'vitest';
import {
  decodeFollowersCursor,
  decodeFollowingCursor,
  encodeFollowersCursor,
  encodeFollowingCursor,
} from './followCursor';

describe('followers cursor', () => {
  it('round-trips the last id', () => {
    const id = '6650f0c2a1b2c3d4e5f60718';
    expect(decodeFollowersCursor(encodeFollowersCursor(id))).toBe(id);
  });

  it.each([
    ['garbage', 'not a cursor'],
    ['a following cursor', encodeFollowingCursor(20)],
    ['a bad id', Buffer.from(JSON.stringify({ id: 'nope' })).toString('base64url')],
  ])('rejects %s', (_, cursor) => {
    expect(decodeFollowersCursor(cursor)).toBeNull();
  });
});

describe('following cursor', () => {
  it('round-trips the offset', () => {
    expect(decodeFollowingCursor(encodeFollowingCursor(40))).toBe(40);
  });

  it.each([
    ['garbage', '%%%'],
    ['a followers cursor', encodeFollowersCursor('6650f0c2a1b2c3d4e5f60718')],
    ['a zero offset', encodeFollowingCursor(0)],
    ['a fractional offset', Buffer.from(JSON.stringify({ at: 1.5 })).toString('base64url')],
  ])('rejects %s', (_, cursor) => {
    expect(decodeFollowingCursor(cursor)).toBeNull();
  });
});
