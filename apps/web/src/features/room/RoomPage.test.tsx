import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceMember, RoomDetail, RoomJoinData } from '@studibrowse/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import { makeUser } from '../../test/renderRoutes';
import { RoomPage } from './RoomPage';

const user = makeUser({ id: 'me', name: 'Alex Smith' });
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ state: { status: 'signedIn', user } }),
}));

// A fake socket: tests fire its connect/disconnect events and play the server's events.
type Listener = (payload?: unknown) => void;
const socketListeners = new Map<string, Set<Listener>>();
const eventHandlers = new Map<string, Listener>();
let socketStatus = 'connected';
const fakeSocket = {
  connected: true,
  on: (event: string, listener: Listener) => {
    socketListeners.set(event, (socketListeners.get(event) ?? new Set()).add(listener));
  },
  off: (event: string, listener: Listener) => socketListeners.get(event)?.delete(listener),
  emit: () => undefined,
};
vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({ socket: fakeSocket, status: socketStatus }),
  useSocketEvent: (event: string, handler: Listener) => {
    eventHandlers.set(event, handler);
  },
}));

const emitWithAck = vi.fn();
vi.mock('../../lib/socket', () => ({
  getSocket: () => fakeSocket,
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const ROOM = '64b7f0c2a1b2c3d4e5f60718';

const member = (userId: string, name: string, changes: Partial<PresenceMember> = {}): PresenceMember => ({
  userId,
  name,
  username: userId,
  avatarColor: 'green',
  status: 'break',
  workingOn: '',
  isHost: false,
  joinedAt: '2026-11-01T10:00:00.000Z',
  focusingSince: null,
  ...changes,
});

function roomDetail(changes: Partial<RoomDetail> = {}): RoomDetail {
  return {
    id: ROOM,
    name: 'Finals week focus',
    subject: 'Maths',
    host: { id: 'maya', name: 'Maya Chen', username: 'maya', avatarColor: 'gold' },
    isPublic: true,
    maxSize: 20,
    memberCount: 2,
    timer: { phase: 'idle', round: 0, endsAt: null, pausedRemaining: null },
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: true,
    },
    description: '',
    goals: [],
    inviteCode: 'aB3xK9_q-2',
    isHost: false,
    totalSessions: 0,
    totalFocusMins: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...changes,
  };
}

function joinData(changes: Partial<RoomJoinData> = {}): RoomJoinData {
  return {
    room: roomDetail(),
    members: [member('maya', 'Maya Chen', { isHost: true }), member('me', 'Alex Smith')],
    resources: [],
    messages: [],
    serverNow: Date.now(),
    ...changes,
  };
}

function serverSends(event: string, payload: unknown) {
  act(() => eventHandlers.get(event)?.(payload));
}

function socketFires(event: 'connect' | 'disconnect') {
  act(() => socketListeners.get(event)?.forEach((listener) => listener()));
}

function renderRoom(path = `/room/${ROOM}`) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/room/:roomId" element={<RoomPage />} />
            <Route path="/home" element={<h1>Home page</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Answers room:join with `data` (or fails with `error`), and every other event with `{}`. */
function answerJoin(result: RoomJoinData | ApiError) {
  emitWithAck.mockImplementation((event: string) => {
    if (event !== 'room:join') return Promise.resolve({});
    return result instanceof ApiError ? Promise.reject(result) : Promise.resolve(result);
  });
}

beforeEach(() => {
  socketListeners.clear();
  eventHandlers.clear();
  socketStatus = 'connected';
  emitWithAck.mockReset();
});
afterEach(cleanup);

describe('RoomPage', () => {
  it('shows the joining screen, then the room', async () => {
    answerJoin(joinData());
    renderRoom();
    expect(screen.getByRole('heading', { name: 'Joining the room' })).toBeDefined();

    // The first render of the whole room is slow when every workspace's tests run at once.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finals week focus' }, { timeout: 5000 }),
    ).toBeDefined();
    expect(emitWithAck).toHaveBeenCalledWith('room:join', { roomId: ROOM });
    expect(screen.getByText('Hosted by Maya')).toBeDefined();
    expect(screen.getByText('Maya is the host and controls the timer.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Ready to start. Round 1 of 4');
    expect(document.title).toBe('Finals week focus · StudiBrowse');
  });

  it('sends the invite code for a private room', async () => {
    answerJoin(joinData());
    renderRoom(`/room/${ROOM}?invite=aB3xK9_q-2`);
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });
    expect(emitWithAck).toHaveBeenCalledWith('room:join', { roomId: ROOM, inviteCode: 'aB3xK9_q-2' });
  });

  it.each([
    ['ROOM_FULL', 'This room is full'],
    ['ROOM_CLOSED', 'This room has closed'],
    ['ROOM_NOT_FOUND', 'We couldn’t find that room'],
  ])('shows the %s screen', async (code, heading) => {
    answerJoin(new ApiError(0, code, 'Nope.'));
    renderRoom();
    expect(await screen.findByRole('heading', { name: heading })).toBeDefined();
  });

  it('shows an error with Try again', async () => {
    answerJoin(new ApiError(0, 'INTERNAL_ERROR', 'Something went wrong.'));
    renderRoom();
    expect(await screen.findByRole('heading', { name: 'We couldn’t open the room' })).toBeDefined();

    answerJoin(joinData());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Finals week focus' })).toBeDefined();
  });

  it('gives the host the timer controls and settings', async () => {
    answerJoin(
      joinData({
        room: roomDetail({ isHost: true }),
        members: [member('me', 'Alex Smith', { isHost: true })],
      }),
    );
    renderRoom();
    fireEvent.click(await screen.findByRole('button', { name: /Start/ }));
    expect(emitWithAck).toHaveBeenCalledWith('timer:start', { roomId: ROOM });
    expect(screen.getByText('You’re the host')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Room settings' })).toBeDefined();
  });

  it('follows presence: a host hand-over gives you the controls', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    serverSends('presence:update', {
      roomId: ROOM,
      members: [member('me', 'Alex Smith', { isHost: true, status: 'focusing' })],
    });
    expect(screen.getByRole('button', { name: /Start/ })).toBeDefined();
    expect(screen.getByText('1 focusing · 0 on break · 0 away')).toBeDefined();
  });

  it('applies the host’s new settings', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    const { timerSettings, isPublic, maxSize, subject, description } = roomDetail();
    serverSends('room:update', {
      roomId: ROOM,
      settings: {
        name: 'Exam cram',
        subject,
        description,
        isPublic,
        maxSize,
        timerSettings: { ...timerSettings, focusMins: 50 },
      },
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Exam cram' })).toBeDefined();
    expect(screen.getByText('50m')).toBeDefined();
  });

  it('shows the reconnecting banner and rejoins after a reconnect', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    socketFires('disconnect');
    expect(screen.getByText('Connection lost.')).toBeDefined();
    // The room stays on screen underneath.
    expect(screen.getByRole('heading', { level: 1, name: 'Finals week focus' })).toBeDefined();

    socketFires('connect');
    await waitFor(() => expect(screen.queryByText('Connection lost.')).toBeNull());
    expect(emitWithAck.mock.calls.filter(([event]) => event === 'room:join')).toHaveLength(2);
    expect(await screen.findByText('Back in the room')).toBeDefined();
  });

  it('shows the removed screen and doesn’t rejoin', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    serverSends('room:removed', { roomId: ROOM });
    expect(screen.getByRole('heading', { name: 'You were removed from this room' })).toBeDefined();
    socketFires('connect');
    expect(emitWithAck.mock.calls.filter(([event]) => event === 'room:join')).toHaveLength(1);
  });

  it('leaves the room on Leave', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeDefined();
    expect(emitWithAck).toHaveBeenCalledWith('room:leave', { roomId: ROOM });
  });

  it('switches side panel tabs with the arrow keys', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    const chat = screen.getByRole('tab', { name: 'Chat' });
    expect(chat.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(chat, { key: 'ArrowRight' });
    const goals = screen.getByRole('tab', { name: 'Goals' });
    expect(goals.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(goals);
    expect(screen.getByText(/No goals yet/)).toBeDefined();

    fireEvent.keyDown(goals, { key: 'End' });
    expect(screen.getByText(/Nothing shared yet/)).toBeDefined();
  });

  it('sends your status and working-on note', async () => {
    answerJoin(joinData());
    renderRoom();
    await screen.findByRole('heading', { level: 1, name: 'Finals week focus' });

    fireEvent.click(screen.getByRole('radio', { name: 'Away' }));
    expect(emitWithAck).toHaveBeenCalledWith('status:set', { roomId: ROOM, status: 'away' });

    const note = screen.getByLabelText('You’re working on');
    fireEvent.focus(note);
    fireEvent.change(note, { target: { value: '  Problem set 6 ' } });
    fireEvent.blur(note);
    expect(emitWithAck).toHaveBeenCalledWith('status:set', { roomId: ROOM, workingOn: 'Problem set 6' });
  });
});
