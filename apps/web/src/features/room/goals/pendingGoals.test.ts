import { describe, expect, it } from 'vitest';
import type { RoomGoal } from '@studibrowse/shared';
import { applyPending } from './pendingGoals';

const goal = (id: string, done = false): RoomGoal => ({ id, text: `Goal ${id}`, done, addedBy: 'hana' });

describe('applyPending', () => {
  const server = [goal('a'), goal('b', true)];

  it('shows the server goals as they are when nothing is pending', () => {
    expect(applyPending(server, [])).toBe(server);
  });

  it('adds a pending goal at the end, unticked and by you', () => {
    expect(
      applyPending(server, [{ kind: 'add', tempId: 'pending-1', text: 'Read ch. 4', addedBy: 'me' }]),
    ).toEqual([
      ...server,
      { id: 'pending-1', text: 'Read ch. 4', done: false, addedBy: 'me', pending: true },
    ]);
  });

  it('flips a toggled goal, and two toggles cancel out', () => {
    expect(applyPending(server, [{ kind: 'toggle', goalId: 'a' }]).map((g) => g.done)).toEqual([true, true]);
    const twice = applyPending(server, [
      { kind: 'toggle', goalId: 'b' },
      { kind: 'toggle', goalId: 'b' },
    ]);
    expect(twice.map((g) => g.done)).toEqual([false, true]);
  });

  it('hides a removed goal', () => {
    expect(applyPending(server, [{ kind: 'remove', goalId: 'a' }]).map((g) => g.id)).toEqual(['b']);
  });

  it('changes nothing for a goal the server no longer has', () => {
    const ops = [
      { kind: 'toggle', goalId: 'gone' },
      { kind: 'remove', goalId: 'gone' },
    ] as const;
    expect(applyPending(server, [...ops])).toEqual(server);
  });

  it('applies ops in the order they were made', () => {
    const shown = applyPending(server, [
      { kind: 'add', tempId: 'pending-1', text: 'New', addedBy: 'me' },
      { kind: 'remove', goalId: 'a' },
      { kind: 'toggle', goalId: 'b' },
    ]);
    expect(shown.map((g) => [g.id, g.done])).toEqual([
      ['b', false],
      ['pending-1', false],
    ]);
  });
});
