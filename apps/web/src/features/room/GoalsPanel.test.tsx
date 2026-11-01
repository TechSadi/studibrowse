import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_GOALS, type PresenceMember, type RoomGoal } from '@studibrowse/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import { useRoomGoals } from './goals/useRoomGoals';
import { GoalsPanel } from './GoalsPanel';

const emitWithAck = vi.fn();
vi.mock('../../lib/socket', () => ({
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const ROOM = 'room-1';
const ME = 'me';

const hana: PresenceMember = {
  userId: 'hana',
  name: 'Hana Ito',
  username: 'hana',
  avatarColor: 'green',
  status: 'break',
  workingOn: '',
  isHost: false,
  joinedAt: '2026-01-05T19:00:00.000Z',
  focusingSince: null,
};

const mine: RoomGoal = { id: 'g1', text: 'Finish one past paper', done: true, addedBy: ME };
const hanas: RoomGoal = { id: 'g2', text: 'Share one useful resource', done: false, addedBy: 'hana' };

function Harness({ goals, isHost }: { goals: RoomGoal[]; isHost: boolean }) {
  const roomGoals = useRoomGoals(ROOM, goals, ME);
  return <GoalsPanel roomGoals={roomGoals} members={[hana]} myUserId={ME} isHost={isHost} />;
}

function renderPanel(goals: RoomGoal[] = [mine, hanas], isHost = false) {
  return render(
    <ToastProvider>
      <Harness goals={goals} isHost={isHost} />
    </ToastProvider>,
  );
}

const input = () => screen.getByRole('textbox', { name: 'New goal' });
const toggleFor = (text: string) => screen.getByRole('button', { name: new RegExp(`^${text}`) });

function addGoal(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.submit(input().closest('form')!);
}

beforeEach(() => {
  emitWithAck.mockReset();
  emitWithAck.mockResolvedValue({});
});
afterEach(cleanup);

describe('GoalsPanel', () => {
  it('shows progress and who added each goal', () => {
    renderPanel();
    expect(screen.getByText('1 of 2 done')).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'Room goals done' }).getAttribute('aria-valuenow')).toBe(
      '1',
    );
    expect(screen.getByText('Added by you')).toBeDefined();
    expect(screen.getByText('Added by Hana')).toBeDefined();
    expect(toggleFor('Finish one past paper').getAttribute('aria-pressed')).toBe('true');
    expect(toggleFor('Share one useful resource').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the empty state with the add form', () => {
    renderPanel([]);
    expect(screen.getByText(/No goals yet. Add one so the room knows/)).toBeDefined();
    expect(screen.getByText('0 of 0 done')).toBeDefined();
    expect(input().getAttribute('placeholder')).toBe('Add a goal for the room');
  });

  it('shows × only on your own goals, or on every goal for the host', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Remove goal: Finish one past paper' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Remove goal: Share one useful resource' })).toBeNull();
    cleanup();

    renderPanel([mine, hanas], true);
    expect(screen.getAllByRole('button', { name: /^Remove goal:/ })).toHaveLength(2);
  });

  it('ticks a goal from the keyboard-reachable toggle button', async () => {
    renderPanel();
    const toggle = toggleFor('Share one useful resource');
    expect(toggle.tagName).toBe('BUTTON');
    fireEvent.click(toggle);
    expect(emitWithAck).toHaveBeenCalledWith('goal:toggle', { roomId: ROOM, goalId: 'g2' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await act(async () => undefined);
  });

  it('adds a goal straight away and clears the input', async () => {
    renderPanel([]);
    addGoal('  Read chapter 4  ');
    expect(emitWithAck).toHaveBeenCalledWith('goal:add', { roomId: ROOM, text: 'Read chapter 4' });
    expect(screen.getByText('Read chapter 4')).toBeDefined();
    expect((input() as HTMLInputElement).value).toBe('');
    await act(async () => undefined);
  });

  it('rolls back a refused add, gives the text back and says why', async () => {
    emitWithAck.mockRejectedValueOnce(new ApiError(0, 'GOAL_EXISTS', 'The room already has that goal.'));
    renderPanel([]);
    addGoal('Read chapter 4');

    await waitFor(() => expect(screen.getByText('The room already has that goal.')).toBeDefined());
    expect(screen.queryByRole('button', { name: /Read chapter 4/ })).toBeNull();
    expect((input() as HTMLInputElement).value).toBe('Read chapter 4');
  });

  it(`stops at ${MAX_GOALS} goals without asking the server`, () => {
    const full = Array.from({ length: MAX_GOALS }, (_, i) => ({ ...hanas, id: `g${i}`, text: `Goal ${i}` }));
    renderPanel(full);
    addGoal('One too many');
    expect(emitWithAck).not.toHaveBeenCalled();
    expect(screen.getByText('Goal limit reached')).toBeDefined();
  });

  it('ignores a blank goal', () => {
    renderPanel([]);
    addGoal('   ');
    expect(emitWithAck).not.toHaveBeenCalled();
  });
});
