import { describe, expect, it } from 'vitest';
import type { PresenceMember } from '@studibrowse/shared';
import { firstName, statusLine, statusSummary } from './people';

const member = (changes: Partial<PresenceMember>): PresenceMember => ({
  userId: 'u1',
  name: 'Maya Chen',
  username: 'maya',
  avatarColor: 'blue',
  status: 'focusing',
  workingOn: '',
  isHost: false,
  joinedAt: '2026-11-01T10:00:00.000Z',
  focusingSince: '2026-11-01T10:00:00.000Z',
  ...changes,
});

describe('statusLine', () => {
  const now = Date.parse('2026-11-01T10:23:40.000Z');

  it('counts whole minutes of focus', () => {
    expect(statusLine(member({}), now)).toBe('Focusing · 23 min');
    expect(statusLine(member({ focusingSince: null }), now)).toBe('Focusing');
  });

  it('names breaks and away', () => {
    expect(statusLine(member({ status: 'break', focusingSince: null }), now)).toBe('On a break');
    expect(statusLine(member({ status: 'away', focusingSince: null }), now)).toBe('Away');
  });
});

describe('statusSummary', () => {
  it('counts each status', () => {
    const members = [member({}), member({ status: 'break' }), member({ status: 'focusing' })];
    expect(statusSummary(members)).toBe('2 focusing · 1 on break · 0 away');
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('  Maya Chen ')).toBe('Maya');
    expect(firstName('Hana')).toBe('Hana');
  });
});
