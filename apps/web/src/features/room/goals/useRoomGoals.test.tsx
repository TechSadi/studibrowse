import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomGoal } from '@studibrowse/shared';
import { ApiError } from '../../../lib/api';
import { useRoomGoals } from './useRoomGoals';

const emitWithAck = vi.fn();
vi.mock('../../../lib/socket', () => ({
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const ROOM = 'room-1';
const ME = 'me';

const goal = (id: string, done = false, addedBy = 'hana'): RoomGoal => ({
  id,
  text: `Goal ${id}`,
  done,
  addedBy,
});

/** An ack the test answers by hand. */
function deferredAck() {
  let resolve!: (value: unknown) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  emitWithAck.mockReturnValueOnce(promise);
  return { resolve, reject };
}

function renderGoals(initial: RoomGoal[]) {
  // `goals` plays the room session: a new array is a goal:update.
  return renderHook(({ goals }) => useRoomGoals(ROOM, goals, ME), { initialProps: { goals: initial } });
}

const refusal = () => new ApiError(0, 'GOAL_LIMIT', 'A room can have up to 10 goals.');

beforeEach(() => {
  emitWithAck.mockReset();
});
afterEach(cleanup);

describe('useRoomGoals', () => {
  it('shows an added goal straight away, then the server’s version once acked', async () => {
    const ack = deferredAck();
    const { result, rerender } = renderGoals([goal('a')]);

    let adding!: Promise<void>;
    act(() => {
      adding = result.current.add('Read ch. 4');
    });
    expect(emitWithAck).toHaveBeenCalledWith('goal:add', { roomId: ROOM, text: 'Read ch. 4' });
    expect(result.current.goals).toEqual([
      goal('a'),
      {
        id: expect.stringMatching(/^pending-/) as unknown,
        text: 'Read ch. 4',
        done: false,
        addedBy: ME,
        pending: true,
      },
    ]);

    // goal:update arrives before the ack.
    const saved = { id: 'b', text: 'Read ch. 4', done: false, addedBy: ME };
    rerender({ goals: [goal('a'), saved] });
    await act(async () => {
      ack.resolve({});
      await adding;
    });
    expect(result.current.goals).toEqual([goal('a'), saved]);
  });

  it('rolls an add back and rethrows when the server refuses it', async () => {
    const ack = deferredAck();
    const { result } = renderGoals([goal('a')]);

    let adding!: Promise<void>;
    act(() => {
      adding = result.current.add('One too many');
    });
    expect(result.current.goals).toHaveLength(2);

    await act(async () => {
      ack.reject(refusal());
      await expect(adding).rejects.toMatchObject({ code: 'GOAL_LIMIT' });
    });
    expect(result.current.goals).toEqual([goal('a')]);
  });

  it('ticks a goal straight away and unticks it again when refused', async () => {
    const ack = deferredAck();
    const { result } = renderGoals([goal('a')]);

    let toggling!: Promise<void>;
    act(() => {
      toggling = result.current.toggle('a');
    });
    expect(emitWithAck).toHaveBeenCalledWith('goal:toggle', { roomId: ROOM, goalId: 'a' });
    expect(result.current.goals[0]!.done).toBe(true);

    await act(async () => {
      ack.reject(new ApiError(0, 'GOAL_NOT_FOUND', 'That goal isn’t in the room any more.'));
      await toggling.catch(() => undefined);
    });
    expect(result.current.goals[0]!.done).toBe(false);
  });

  it('hides a removed goal straight away and brings it back when refused', async () => {
    const ack = deferredAck();
    const { result } = renderGoals([goal('a'), goal('b')]);

    let removing!: Promise<void>;
    act(() => {
      removing = result.current.remove('a');
    });
    expect(emitWithAck).toHaveBeenCalledWith('goal:remove', { roomId: ROOM, goalId: 'a' });
    expect(result.current.goals.map((g) => g.id)).toEqual(['b']);

    await act(async () => {
      ack.reject(
        new ApiError(0, 'NOT_GOAL_AUTHOR', 'Only the person who added a goal or the host can remove it.'),
      );
      await removing.catch(() => undefined);
    });
    expect(result.current.goals.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('keeps other people’s changes that arrive while yours is pending, and after a rollback', async () => {
    const ack = deferredAck();
    const { result, rerender } = renderGoals([goal('a'), goal('b')]);

    let toggling!: Promise<void>;
    act(() => {
      toggling = result.current.toggle('a');
    });
    // Someone else ticks b and adds c meanwhile.
    rerender({ goals: [goal('a'), goal('b', true), goal('c')] });
    expect(result.current.goals.map((g) => [g.id, g.done])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
    ]);

    await act(async () => {
      ack.reject(refusal());
      await toggling.catch(() => undefined);
    });
    expect(result.current.goals.map((g) => [g.id, g.done])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
  });
});
