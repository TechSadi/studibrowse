import { describe, expect, it } from 'vitest';
import type { RunFocus } from '../rooms/roomTimer.service';
import { hasLoggableFocus, toParticipants, totalFocusMins } from './focusAccounting';

const MIN = 60_000;
const at = new Date('2026-03-10T09:00:00Z');
const focus = (userId: string, focusedMs: number): RunFocus => ({
  userId,
  focusedMs,
  firstFocusAt: at,
  lastFocusAt: at,
});

describe('toParticipants', () => {
  it('rounds each total down to whole minutes', () => {
    expect(toParticipants([focus('maya', 25 * MIN), focus('jordan', 7 * MIN + 59_999)])).toEqual([
      { userId: 'maya', focusedMins: 25 },
      { userId: 'jordan', focusedMins: 7 },
    ]);
  });

  it('leaves out anyone under a minute', () => {
    expect(toParticipants([focus('maya', 59_999), focus('jordan', MIN)])).toEqual([
      { userId: 'jordan', focusedMins: 1 },
    ]);
  });

  it('works from the running total, so partial credits don’t lose their seconds', () => {
    // Three drains of 40 s each are 2 minutes, not 0 + 0 + 0.
    expect(toParticipants([focus('maya', 3 * 40_000)])).toEqual([{ userId: 'maya', focusedMins: 2 }]);
  });
});

describe('hasLoggableFocus', () => {
  it('needs someone with at least a minute', () => {
    expect(hasLoggableFocus([])).toBe(false);
    expect(hasLoggableFocus([focus('maya', 59_000), focus('jordan', 30_000)])).toBe(false);
    expect(hasLoggableFocus([focus('maya', MIN)])).toBe(true);
  });
});

describe('totalFocusMins', () => {
  it('adds up everyone’s minutes', () => {
    expect(
      totalFocusMins([
        { userId: 'maya', focusedMins: 25 },
        { userId: 'jordan', focusedMins: 7 },
      ]),
    ).toBe(32);
  });
});
