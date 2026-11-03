import { describe, expect, it } from 'vitest';
import { notificationText } from './notificationText';

describe('notificationText', () => {
  it.each([
    [{ type: 'roomStarted', hostName: 'Maya Kapoor' } as const, 'Maya Kapoor opened a room'],
    [{ type: 'roomFull' } as const, 'Your room is full'],
    [{ type: 'memberJoined', firstName: 'Ben Okafor', count: 1 } as const, 'Ben Okafor joined your room'],
    [
      { type: 'memberJoined', firstName: 'Ben Okafor', count: 2 } as const,
      'Ben Okafor and 1 other joined your room',
    ],
    [
      { type: 'memberJoined', firstName: 'Ben Okafor', count: 5 } as const,
      'Ben Okafor and 4 others joined your room',
    ],
    [{ type: 'roundEnded', round: 2 } as const, 'Round 2 complete'],
  ])('%o reads "%s"', (input, text) => {
    expect(notificationText(input)).toBe(text);
  });
});
