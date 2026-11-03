import { describe, expect, it } from 'vitest';
import { timeAgo } from './format';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

describe('timeAgo', () => {
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [5, '5 days ago'],
    [29, '29 days ago'],
    [30, 'a month ago'],
    [95, '3 months ago'],
    [364, 'a year ago'],
    [365, 'a year ago'],
    [800, '2 years ago'],
  ])('%i days ago reads "%s"', (days, text) => {
    expect(timeAgo(daysAgo(days), NOW)).toBe(text);
  });
});
