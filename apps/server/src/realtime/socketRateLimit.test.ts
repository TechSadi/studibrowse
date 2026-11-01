import { describe, expect, it } from 'vitest';
import { createSocketRateLimiter } from './socketRateLimit';

function limiterWithClock(limit: number, windowMs: number) {
  const clock = { now: 0 };
  const limiter = createSocketRateLimiter({ limit, windowMs }, () => clock.now);
  return { limiter, clock };
}

describe('createSocketRateLimiter', () => {
  it('allows the limit, then blocks', () => {
    const { limiter } = limiterWithClock(3, 1000);
    expect([1, 2, 3, 4].map(() => limiter.consume('a'))).toEqual([true, true, true, false]);
  });

  it('frees a slot once the oldest hit leaves the window', () => {
    const { limiter, clock } = limiterWithClock(2, 1000);
    limiter.consume('a');
    clock.now = 500;
    limiter.consume('a');
    clock.now = 999;
    expect(limiter.consume('a')).toBe(false);
    clock.now = 1000;
    expect(limiter.consume('a')).toBe(true);
    // The hit at 500 is still in the window.
    expect(limiter.consume('a')).toBe(false);
  });

  it('does not count blocked events, so spamming does not extend the block', () => {
    const { limiter, clock } = limiterWithClock(1, 1000);
    limiter.consume('a');
    clock.now = 900;
    expect(limiter.consume('a')).toBe(false);
    clock.now = 1000;
    expect(limiter.consume('a')).toBe(true);
  });

  it('counts each key separately', () => {
    const { limiter } = limiterWithClock(1, 1000);
    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('b')).toBe(true);
    expect(limiter.consume('a')).toBe(false);
  });

  it('starts a forgotten key from zero', () => {
    const { limiter } = limiterWithClock(1, 1000);
    limiter.consume('a');
    limiter.forget('a');
    expect(limiter.consume('a')).toBe(true);
  });
});
