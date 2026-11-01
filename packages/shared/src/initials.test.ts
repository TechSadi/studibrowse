import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

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
