import { describe, expect, it } from 'vitest';
import { PASSWORD_HINT, passwordHint, passwordScore } from './passwordStrength';

describe('passwordScore', () => {
  it.each([
    ['', 0],
    ['abc', 0],
    ['abcdefgh', 1],
    ['abcdefg1', 2],
    ['abcdefgh1!', 3],
    ['Abcdefgh1!', 4],
    ['Abcdefghijk1!', 4],
    ['abcdefghijkl', 2],
  ])('scores %j as %i', (password, score) => {
    expect(passwordScore(password)).toBe(score);
  });
});

describe('passwordHint', () => {
  it('shows the default hint for an empty password', () => {
    expect(passwordHint('')).toEqual({ text: PASSWORD_HINT, ok: false });
  });

  it('describes each strength level', () => {
    expect(passwordHint('abc').text).toMatch(/^Too weak/);
    expect(passwordHint('abcdefg1').text).toMatch(/^Okay/);
    expect(passwordHint('abcdefgh1!')).toEqual({ text: 'Strong password.', ok: true });
  });
});
