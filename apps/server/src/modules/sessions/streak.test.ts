import { describe, expect, it } from 'vitest';
import { localDayNumber, nextStreak, resolveTimeZone, type StreakState } from './streak';

const fresh: StreakState = { current: 0, longest: 0, lastStudiedAt: null };
const utc = (iso: string) => new Date(`${iso}Z`);

/** Applies each study time in order, starting from `state`. */
function studies(timeZone: string, times: Date[], state: StreakState = fresh): StreakState {
  return times.reduce((current, studiedAt) => nextStreak(current, studiedAt, timeZone), state);
}

describe('localDayNumber', () => {
  it('counts days in the given zone, not UTC', () => {
    const lateEveningInLA = utc('2026-03-11T06:30:00'); // 23:30 on 10 March in Los Angeles
    expect(
      localDayNumber(lateEveningInLA, 'UTC') - localDayNumber(lateEveningInLA, 'America/Los_Angeles'),
    ).toBe(1);
    const earlyMorningInTokyo = utc('2026-03-10T16:30:00'); // 01:30 on 11 March in Tokyo
    expect(
      localDayNumber(earlyMorningInTokyo, 'Asia/Tokyo') - localDayNumber(earlyMorningInTokyo, 'UTC'),
    ).toBe(1);
  });

  it('falls back to UTC for a zone it doesn’t know', () => {
    const date = utc('2026-03-10T23:30:00');
    expect(localDayNumber(date, 'Mars/Olympus')).toBe(localDayNumber(date, 'UTC'));
  });
});

describe('resolveTimeZone', () => {
  it('keeps a zone it knows and falls back to UTC for one it doesn’t', () => {
    expect(resolveTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(resolveTimeZone('Mars/Olympus')).toBe('UTC');
  });
});

describe('nextStreak', () => {
  it('starts at 1 on the first study day', () => {
    const at = utc('2026-03-10T09:00:00');
    expect(nextStreak(fresh, at, 'UTC')).toEqual({ current: 1, longest: 1, lastStudiedAt: at });
  });

  it('counts a day once, however many sessions it has', () => {
    const last = utc('2026-03-10T21:00:00');
    expect(studies('UTC', [utc('2026-03-10T09:00:00'), utc('2026-03-10T14:00:00'), last])).toEqual({
      current: 1,
      longest: 1,
      lastStudiedAt: last,
    });
  });

  it('adds a day for each day in a row', () => {
    const state = studies('UTC', [
      utc('2026-03-10T09:00:00'),
      utc('2026-03-11T23:59:00'),
      utc('2026-03-12T00:01:00'),
    ]);
    expect(state).toMatchObject({ current: 3, longest: 3 });
  });

  it('starts over after a missed day and keeps the longest', () => {
    const state = studies('UTC', [
      utc('2026-03-10T09:00:00'),
      utc('2026-03-11T09:00:00'),
      utc('2026-03-12T09:00:00'),
      utc('2026-03-14T09:00:00'),
    ]);
    expect(state).toMatchObject({ current: 1, longest: 3 });
    expect(studies('UTC', [utc('2026-03-15T09:00:00')], state)).toMatchObject({ current: 2, longest: 3 });
  });

  it('starts over when an old streak had already lapsed to 0', () => {
    const lapsed: StreakState = { current: 0, longest: 6, lastStudiedAt: utc('2026-03-01T09:00:00') };
    expect(nextStreak(lapsed, utc('2026-03-10T09:00:00'), 'UTC')).toMatchObject({ current: 1, longest: 6 });
  });

  it('ignores a study time earlier than the last one (a session saved late)', () => {
    const state = studies('UTC', [utc('2026-03-10T09:00:00'), utc('2026-03-11T09:00:00')]);
    expect(nextStreak(state, utc('2026-03-09T09:00:00'), 'UTC')).toEqual(state);
  });

  describe('time zones', () => {
    // 23:30 and 00:30 local in Los Angeles (UTC−7 in March) are one UTC day but two local days.
    const laEvening = utc('2026-03-11T06:30:00');
    const laAfterMidnight = utc('2026-03-11T07:30:00');

    it('counts two days in Los Angeles where UTC sees one', () => {
      expect(studies('America/Los_Angeles', [laEvening, laAfterMidnight])).toMatchObject({ current: 2 });
      expect(studies('UTC', [laEvening, laAfterMidnight])).toMatchObject({ current: 1 });
    });

    it('counts one day in Tokyo where UTC sees two', () => {
      // 08:30 and 09:30 on 11 March in Tokyo (UTC+9), either side of UTC midnight.
      const before = utc('2026-03-10T23:30:00');
      const after = utc('2026-03-11T00:30:00');
      expect(studies('Asia/Tokyo', [before, after])).toMatchObject({ current: 1 });
      expect(studies('UTC', [before, after])).toMatchObject({ current: 2 });
    });

    it('treats the day the clocks change as one day', () => {
      // US clocks go forward at 02:00 on 8 March 2026: that day is 23 hours long in New York.
      const dayBefore = utc('2026-03-07T23:00:00'); // 18:00 on 7 March (UTC−5)
      const startOfChangeDay = utc('2026-03-08T05:30:00'); // 00:30 on 8 March
      const endOfChangeDay = utc('2026-03-09T03:30:00'); // 23:30 on 8 March (UTC−4)
      const nextDay = utc('2026-03-09T04:30:00'); // 00:30 on 9 March
      const state = studies('America/New_York', [dayBefore, startOfChangeDay, endOfChangeDay]);
      expect(state).toMatchObject({ current: 2 });
      expect(nextStreak(state, nextDay, 'America/New_York')).toMatchObject({ current: 3 });
    });
  });
});
