import { describe, expect, it } from 'vitest';
import type { PresenceMember } from '@studibrowse/shared';
import { hostChangeText, phaseChangeText } from './systemLines';

describe('phaseChangeText', () => {
  it('marks the end of a focus round and the start of the break', () => {
    expect(phaseChangeText({ phase: 'focus', round: 2 }, { phase: 'shortBreak', round: 2 })).toBe(
      'Round 2 complete · break started',
    );
    expect(phaseChangeText({ phase: 'focus', round: 4 }, { phase: 'longBreak', round: 4 })).toBe(
      'Round 4 complete · long break started',
    );
  });

  it('marks a new round, the end of the run and a fresh start', () => {
    expect(phaseChangeText({ phase: 'shortBreak', round: 1 }, { phase: 'focus', round: 2 })).toBe(
      'Round 2 started',
    );
    expect(phaseChangeText({ phase: 'idle', round: 1 }, { phase: 'focus', round: 1 })).toBe(
      'Round 1 started',
    );
    expect(phaseChangeText({ phase: 'focus', round: 4 }, { phase: 'done', round: 4 })).toBe(
      'Session complete · logged for everyone',
    );
    expect(phaseChangeText({ phase: 'done', round: 4 }, { phase: 'focus', round: 1 })).toBe(
      'New session started',
    );
  });

  it('says nothing when nothing moved on, or on a reset', () => {
    expect(phaseChangeText({ phase: 'focus', round: 1 }, { phase: 'focus', round: 1 })).toBeNull();
    expect(phaseChangeText({ phase: 'focus', round: 2 }, { phase: 'idle', round: 1 })).toBeNull();
    expect(phaseChangeText({ phase: 'idle', round: 1 }, { phase: 'shortBreak', round: 1 })).toBeNull();
  });
});

describe('hostChangeText', () => {
  const maya = { userId: 'maya', name: 'Maya Kapoor' } as PresenceMember;

  it('names the new host, or tells you it’s you', () => {
    expect(hostChangeText(maya, 'me')).toBe('Maya is now the host');
    expect(hostChangeText(maya, 'maya')).toBe('You’re now the host');
    expect(hostChangeText(undefined, 'me')).toBeNull();
  });
});
