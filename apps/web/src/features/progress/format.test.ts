import { describe, expect, it } from 'vitest';
import {
  chartMax,
  formatDelta,
  goalPercent,
  goalsText,
  longestStreakText,
  peopleText,
  rangeLabel,
  roundsText,
  sessionDayLabel,
  sessionsNote,
  shortDayOf,
  toGoalText,
  weekDelta,
  weekdayOf,
} from './format';

const week = ['01', '02', '03', '04', '05', '06', '07'].map((d) => ({ date: `2026-11-${d}`, focusMins: 0 }));

describe('day labels', () => {
  it('reads the server’s days as they are, whatever the browser’s zone', () => {
    expect(weekdayOf('2026-11-01')).toBe('Sun');
    expect(weekdayOf('2026-11-01', true)).toBe('Sunday');
    expect(shortDayOf('2026-10-29')).toBe('Thu 29 Oct');
  });

  it('names the week from Sunday to Saturday', () => {
    expect(rangeLabel(week)).toBe('Sun 1 Nov to Sat 7 Nov');
  });
});

describe('sessionDayLabel', () => {
  const now = new Date(2026, 10, 4, 18, 0); // Wednesday 4 November, 6pm local

  it('says Today and Yesterday, then the date', () => {
    expect(sessionDayLabel(new Date(2026, 10, 4, 0, 30).toISOString(), now)).toBe('Today');
    expect(sessionDayLabel(new Date(2026, 10, 3, 23, 30).toISOString(), now)).toBe('Yesterday');
    expect(sessionDayLabel(new Date(2026, 9, 29, 12, 0).toISOString(), now)).toBe('Thu 29 Oct');
  });
});

describe('table cells', () => {
  it('shows planned rounds when known', () => {
    expect(roundsText(3, 4)).toBe('3 of 4');
    expect(roundsText(3, null)).toBe('3');
  });

  it('says when a room had no goals', () => {
    expect(goalsText(2, 4)).toBe('2 of 4');
    expect(goalsText(0, 0)).toBe('None set');
  });

  it('says who you studied with', () => {
    expect(peopleText(12)).toBe('with 12 people');
    expect(peopleText(1)).toBe('just you');
  });
});

describe('weekly numbers', () => {
  it('works out the goal percent, uncapped', () => {
    expect(goalPercent(520, 720)).toBe(72);
    expect(goalPercent(900, 720)).toBe(125);
    expect(goalPercent(30, 0)).toBe(0);
  });

  it('compares with last week only when there was one', () => {
    expect(weekDelta(520, 440)).toBe(18);
    expect(weekDelta(300, 400)).toBe(-25);
    expect(weekDelta(300, 0)).toBeNull();
    expect(formatDelta(18)).toBe('+18%');
    expect(formatDelta(-25)).toBe('−25%');
  });

  it('says what’s left until Saturday', () => {
    expect(toGoalText(520, 720)).toBe('3h 20m to reach your goal by Saturday');
    expect(toGoalText(720, 720)).toBe('Goal reached. Nice work.');
    expect(toGoalText(0, 720)).toBe('Finish a focus round to start your week.');
  });

  it('describes the week’s sessions', () => {
    expect(sessionsNote({ sessions: 14, people: 23, rooms: 9 })).toBe(
      'With 23 different people across 9 rooms',
    );
    expect(sessionsNote({ sessions: 1, people: 1, rooms: 1 })).toBe('With 1 different person across 1 room');
    expect(sessionsNote({ sessions: 2, people: 0, rooms: 1 })).toBe('Just you so far, in 1 room');
    expect(sessionsNote({ sessions: 0, people: 0, rooms: 0 })).toBe('Join a room to log your first one.');
  });

  it('describes the longest streak', () => {
    expect(longestStreakText(11)).toBe('Your longest streak is 11 days');
    expect(longestStreakText(1)).toBe('Your longest streak is 1 day');
    expect(longestStreakText(0)).toBe('Finish a focus round to start one.');
  });
});

describe('chartMax', () => {
  it('fits the biggest day or the daily pace, with headroom', () => {
    expect(chartMax([{ date: '2026-11-01', focusMins: 200 }], 700)).toBeCloseTo(230);
    expect(chartMax([{ date: '2026-11-01', focusMins: 10 }], 700)).toBeCloseTo(115);
  });

  it('still has a scale with no goal and no time', () => {
    expect(chartMax(week, 0)).toBe(60);
  });
});
