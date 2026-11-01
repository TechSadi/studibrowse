import { describe, expect, it } from 'vitest';
import { mergeFocusCredits } from './roomTimer.service';

describe('mergeFocusCredits', () => {
  it('adds to existing totals and appends new members', () => {
    const startedAt = new Date('2026-01-05T09:00:00.000Z');
    const run = { startedAt, focus: [{ userId: 'maya', focusedMs: 1000 }] };
    expect(
      mergeFocusCredits(run, [
        { userId: 'maya', focusedMs: 500 },
        { userId: 'jordan', focusedMs: 200 },
      ]),
    ).toEqual({
      startedAt,
      focus: [
        { userId: 'maya', focusedMs: 1500 },
        { userId: 'jordan', focusedMs: 200 },
      ],
    });
    // Pure: the run it was given is unchanged.
    expect(run.focus).toEqual([{ userId: 'maya', focusedMs: 1000 }]);
  });
});
