import { describe, expect, it } from 'vitest';
import type { LatestSessionResponse } from '@studibrowse/shared';
import { formatGoal, summaryView } from './sessionSummary';

const data: LatestSessionResponse = {
  session: {
    id: 's1',
    roomName: 'Finals week focus',
    startedAt: '2026-11-01T10:00:00.000Z',
    endedAt: null,
    focusedMins: 100,
    roundsCompleted: 2,
    goalsDone: 2,
    goalsTotal: 4,
  },
  roomOpen: true,
  week: { focusMins: 620, goalMins: 720 },
  streakDays: 6,
};

describe('summaryView', () => {
  it('shows the session and the week as in the mockup', () => {
    expect(summaryView(data, [])).toEqual({
      focused: '1h 40m',
      rounds: '2',
      goals: '2/4',
      weekly: '10h 20m of 12h. 6-day streak kept.',
      weeklyPercent: '86%',
    });
  });

  it('shows zeros and the room’s goals without a session', () => {
    const goals = [
      { id: 'g1', text: 'Past paper', done: true, addedBy: 'me' },
      { id: 'g2', text: 'Flashcards', done: false, addedBy: 'me' },
    ];
    expect(summaryView({ ...data, session: null }, goals)).toMatchObject({
      focused: '0m',
      rounds: '0',
      goals: '1/2',
    });
  });

  it('leaves out a streak that isn’t alive today', () => {
    expect(summaryView({ ...data, streakDays: 0 }, []).weekly).toBe('10h 20m of 12h.');
  });

  it('goes past 100% and copes with no goal', () => {
    expect(summaryView({ ...data, week: { focusMins: 900, goalMins: 600 } }, []).weeklyPercent).toBe('150%');
    expect(summaryView({ ...data, week: { focusMins: 30, goalMins: 0 } }, []).weeklyPercent).toBe('0%');
  });
});

describe('formatGoal', () => {
  it('drops the minutes on whole hours', () => {
    expect(formatGoal(720)).toBe('12h');
    expect(formatGoal(90)).toBe('1h 30m');
  });
});
