import { describe, expect, it } from 'vitest';
import { MAX_ROOM_SIZE, ROOM_GRACE_MS } from './constants';

// Both values are set by docs/SPEC.md; change the spec first.
describe('room constants', () => {
  it('caps rooms at 20 people', () => {
    expect(MAX_ROOM_SIZE).toBe(20);
  });

  it('keeps an empty room open for 5 minutes', () => {
    expect(ROOM_GRACE_MS).toBe(5 * 60 * 1000);
  });
});
