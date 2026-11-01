import { describe, expect, it } from 'vitest';
import { emptyRun, isRunActive, mergeFocusCredits, newRun } from './roomTimer.service';

const T0 = new Date('2026-01-05T09:00:00.000Z');
const T1 = new Date('2026-01-05T09:25:00.000Z');

describe('mergeFocusCredits', () => {
  it('adds to existing totals and appends new members, stamping when each was credited', () => {
    const run = {
      ...newRun(T0),
      focus: [{ userId: 'maya', focusedMs: 1000, firstFocusAt: T0, lastFocusAt: T0 }],
    };
    expect(
      mergeFocusCredits(
        run,
        [
          { userId: 'maya', focusedMs: 500 },
          { userId: 'jordan', focusedMs: 200 },
        ],
        T1,
      ).focus,
    ).toEqual([
      { userId: 'maya', focusedMs: 1500, firstFocusAt: T0, lastFocusAt: T1 },
      { userId: 'jordan', focusedMs: 200, firstFocusAt: T1, lastFocusAt: T1 },
    ]);
    // Pure: the run it was given is unchanged.
    expect(run.focus).toEqual([{ userId: 'maya', focusedMs: 1000, firstFocusAt: T0, lastFocusAt: T0 }]);
  });
});

describe('runs', () => {
  it('gives each new run its own session id', () => {
    const a = newRun(T0);
    expect(a).toMatchObject({ startedAt: T0, focus: [], roundsCompleted: 0 });
    expect(a.sessionId).toMatch(/^[a-f0-9]{24}$/);
    expect(newRun(T0).sessionId).not.toBe(a.sessionId);
  });

  it('is active once started or once focus was credited', () => {
    expect(isRunActive(emptyRun())).toBe(false);
    expect(isRunActive(newRun(T0))).toBe(true);
    expect(isRunActive(mergeFocusCredits(emptyRun(), [{ userId: 'maya', focusedMs: 1 }], T0))).toBe(true);
  });
});
