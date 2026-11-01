import { describe, expect, it } from 'vitest';
import { avatarTone, initialsOf } from './avatar';

describe('initialsOf', () => {
  it.each([
    ['Alex Smith', 'AS'],
    ['  maya   de la cruz ', 'MC'],
    ['maya', 'MA'],
    ['', '?'],
  ])('%j → %j', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('avatarTone', () => {
  it('maps colours to tone slots in mockup order', () => {
    expect(avatarTone('green')).toBe(1);
    expect(avatarTone('red')).toBe(5);
    expect(avatarTone('olive')).toBe(6);
  });
});
