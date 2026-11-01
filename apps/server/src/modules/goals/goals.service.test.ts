import { describe, expect, it } from 'vitest';
import { canRemoveGoal } from './goals.service';

describe('canRemoveGoal', () => {
  const author = '64b7f0c2a1b2c3d4e5f60718';
  const someoneElse = '64b7f0c2a1b2c3d4e5f60719';

  it('lets the author remove their own goal', () => {
    expect(canRemoveGoal(author, author, false)).toBe(true);
  });

  it('lets the host remove anyone’s goal', () => {
    expect(canRemoveGoal(author, someoneElse, true)).toBe(true);
  });

  it('refuses any other member', () => {
    expect(canRemoveGoal(author, someoneElse, false)).toBe(false);
  });
});
