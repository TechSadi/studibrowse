import { describe, expect, it } from 'vitest';
import { formatGoalHours, formatHomeDate, greetingFor, weekDays } from './dates';

const at = (hour: number, minute = 0) => new Date(2026, 9, 30, hour, minute);

describe('greetingFor', () => {
  it('switches at 5am, noon and 6pm', () => {
    expect(greetingFor(at(4, 59))).toBe('Good evening');
    expect(greetingFor(at(5))).toBe('Good morning');
    expect(greetingFor(at(11, 59))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17, 59))).toBe('Good afternoon');
    expect(greetingFor(at(18))).toBe('Good evening');
  });
});

describe('formatHomeDate', () => {
  it('shows the weekday, month and day', () => {
    expect(formatHomeDate(at(9))).toBe('Friday, October 30');
  });
});

describe('weekDays', () => {
  it('lays out the week from Sunday with today marked and later days in the future', () => {
    const days = weekDays(at(9)); // a Friday
    expect(days.map((d) => d.label).join('')).toBe('SMTWTFS');
    expect(days.map((d) => d.isToday)).toEqual([false, false, false, false, false, true, false]);
    expect(days.map((d) => d.isFuture)).toEqual([false, false, false, false, false, false, true]);
    expect(days[0]!.name).toBe('Sunday');
  });

  it('marks Sunday as today at the start of the week', () => {
    const days = weekDays(new Date(2026, 10, 1, 9));
    expect(days[0]!.isToday).toBe(true);
    expect(days.filter((d) => d.isFuture)).toHaveLength(6);
  });
});

describe('formatGoalHours', () => {
  it('formats whole and fractional hours', () => {
    expect(formatGoalHours(600)).toBe('10 hour');
    expect(formatGoalHours(90)).toBe('1.5 hour');
  });
});
