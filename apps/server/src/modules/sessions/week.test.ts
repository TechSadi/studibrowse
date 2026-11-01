import { describe, expect, it } from 'vitest';
import { localDayNumber } from './streak';
import { isThisWeek, studiedToday, weekStartDay } from './week';

const at = (iso: string) => new Date(iso);
const dayOf = (iso: string) => localDayNumber(at(iso), 'UTC');

describe('weekStartDay', () => {
  it('starts the week on Sunday', () => {
    // 1 November 2026 is a Sunday.
    const sunday = dayOf('2026-11-01T00:00:00Z');
    expect(weekStartDay(at('2026-11-01T00:00:00Z'), 'UTC')).toBe(sunday);
    expect(weekStartDay(at('2026-11-04T12:00:00Z'), 'UTC')).toBe(sunday);
    expect(weekStartDay(at('2026-11-07T23:59:59Z'), 'UTC')).toBe(sunday);
    expect(weekStartDay(at('2026-11-08T00:00:00Z'), 'UTC')).toBe(sunday + 7);
  });

  it('counts in the user’s time zone', () => {
    // 03:00 UTC on Sunday 1 November is still Saturday 31 October in New York.
    const now = at('2026-11-01T03:00:00Z');
    expect(weekStartDay(now, 'UTC')).toBe(dayOf('2026-11-01T00:00:00Z'));
    expect(weekStartDay(now, 'America/New_York')).toBe(dayOf('2026-10-25T00:00:00Z'));
  });
});

describe('isThisWeek', () => {
  const now = at('2026-11-04T12:00:00Z');

  it('includes Sunday to Saturday', () => {
    expect(isThisWeek(at('2026-11-01T00:00:00Z'), now, 'UTC')).toBe(true);
    expect(isThisWeek(at('2026-11-07T23:59:00Z'), now, 'UTC')).toBe(true);
  });

  it('leaves out the Saturday before', () => {
    expect(isThisWeek(at('2026-10-31T23:59:00Z'), now, 'UTC')).toBe(false);
  });

  it('follows the zone across a DST change', () => {
    // Clocks go back in New York at 2am on Sunday 1 November 2026. 03:30 UTC is 23:30 Saturday there,
    // 05:30 UTC is 01:30 Sunday.
    const sundayNow = at('2026-11-02T12:00:00Z');
    expect(isThisWeek(at('2026-11-01T03:30:00Z'), sundayNow, 'America/New_York')).toBe(false);
    expect(isThisWeek(at('2026-11-01T05:30:00Z'), sundayNow, 'America/New_York')).toBe(true);
  });
});

describe('studiedToday', () => {
  it('is false without a study day', () => {
    expect(studiedToday(null, at('2026-11-04T12:00:00Z'), 'UTC')).toBe(false);
  });

  it('compares calendar days in the user’s zone', () => {
    const now = at('2026-11-04T06:00:00Z'); // 22:00 on 3 November in Los Angeles
    const lastNight = at('2026-11-04T01:00:00Z'); // 17:00 on 3 November in Los Angeles
    expect(studiedToday(lastNight, now, 'America/Los_Angeles')).toBe(true);
    expect(studiedToday(at('2026-11-03T06:00:00Z'), now, 'America/Los_Angeles')).toBe(false);
  });
});
