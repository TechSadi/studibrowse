import { describe, expect, it } from 'vitest';
import { streakView } from './streak';

const now = new Date(2026, 9, 30, 18, 0); // Friday 30 October, 6pm local
const noStreak = { days: 0, studiedToday: false, week: Array(7).fill(false) };

function view(current: number, lastStudiedAt: Date | null) {
  const user = { streak: { current, longest: current }, lastStudiedAt: lastStudiedAt?.toISOString() ?? null };
  return streakView(user, now);
}

describe('streakView', () => {
  it('shows no streak before the first session', () => {
    expect(view(0, null)).toEqual(noStreak);
  });

  it('counts today when you studied today', () => {
    const result = view(3, new Date(2026, 9, 30, 9, 0));
    expect(result.days).toBe(3);
    expect(result.studiedToday).toBe(true);
    expect(result.week).toEqual([false, false, false, false, true, true, true]);
  });

  it('keeps the streak alive but leaves today open when you last studied yesterday', () => {
    const result = view(6, new Date(2026, 9, 29, 23, 30));
    expect(result.days).toBe(6);
    expect(result.studiedToday).toBe(false);
    expect(result.week).toEqual([true, true, true, true, true, true, false]);
  });

  it('fills the whole week for streaks longer than 7 days', () => {
    expect(view(20, new Date(2026, 9, 30, 8, 0)).week).toEqual(Array(7).fill(true));
  });

  it('treats a streak whose last session was before yesterday as lapsed', () => {
    expect(view(9, new Date(2026, 9, 28, 12, 0))).toEqual(noStreak);
  });
});
