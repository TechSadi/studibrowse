import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyRoomCard, RoomSummary } from '@studibrowse/shared';
import { ALL_ROOMS } from './roomList';
import { useLiveRooms } from './useLiveRooms';

/** A stand-in socket: only `connected` and the connect listeners matter to the hook. */
function fakeSocket(connected: boolean) {
  const onConnect = new Set<() => void>();
  return {
    connected,
    on: (event: string, listener: () => void) => event === 'connect' && onConnect.add(listener),
    off: (event: string, listener: () => void) => event === 'connect' && onConnect.delete(listener),
    /** The socket (re)connects. */
    connect() {
      this.connected = true;
      onConnect.forEach((listener) => listener());
    },
  };
}

let socket: ReturnType<typeof fakeSocket>;
let status: 'connecting' | 'connected' | 'reconnecting';
const listeners = new Map<string, (payload: never) => void>();

vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({ socket, status }),
  useSocketEvent: (event: string, handler: (payload: never) => void) => {
    listeners.set(event, handler);
  },
}));

const emitWithAck = vi.fn();
vi.mock('../../lib/socket', () => ({
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
  getSocketSnapshot: () => ({ socket, status }),
}));

const listPublic = vi.fn();
vi.mock('../../lib/api', () => ({
  roomsApi: { listPublic: (...args: unknown[]) => listPublic(...args) as unknown },
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ state: { status: 'signedIn', user: { following: ['followed-host'] } } }),
}));

function card(id: string, overrides: Partial<LobbyRoomCard> = {}): LobbyRoomCard {
  return {
    id,
    name: `Room ${id}`,
    subject: 'Maths',
    host: { id: 'someone', name: 'Maya Kapoor', username: 'maya', avatarColor: 'gold' },
    isPublic: true,
    maxSize: 10,
    memberCount: 1,
    isLive: true,
    timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: false,
    },
    createdAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

const summary = (id: string, overrides: Partial<RoomSummary> = {}): RoomSummary => ({
  ...card(id),
  hostFollowed: false,
  ...overrides,
});

let queryClient: QueryClient;

function renderLiveRooms() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLiveRooms(ALL_ROOMS), { wrapper });
}

const lobbyCalls = () => emitWithAck.mock.calls.map(([event]) => event as string);

function push<E extends 'rooms:upsert' | 'rooms:remove'>(event: E, payload: unknown) {
  act(() => (listeners.get(event) as (payload: unknown) => void)(payload));
}

const listedIds = (result: { current: ReturnType<typeof useLiveRooms> }) =>
  result.current.data?.pages.flatMap((page) => page.rooms.map((room) => room.id));

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  socket = fakeSocket(true);
  status = 'connected';
  listeners.clear();
  emitWithAck.mockReset().mockResolvedValue({});
  listPublic.mockReset().mockResolvedValue({ rooms: [summary('a')], nextPage: null });
});

afterEach(cleanup);

describe('useLiveRooms', () => {
  it('loads the list and joins the lobby while mounted', async () => {
    const { result, unmount } = renderLiveRooms();

    await waitFor(() => expect(listedIds(result)).toEqual(['a']));
    expect(listPublic).toHaveBeenCalledWith({ page: 1, ...ALL_ROOMS });
    expect(lobbyCalls()).toEqual(['lobby:subscribe']);

    unmount();
    expect(lobbyCalls()).toEqual(['lobby:subscribe', 'lobby:unsubscribe']);
  });

  it('shares one subscription between lists, until the last one unmounts', () => {
    const first = renderLiveRooms();
    const second = renderLiveRooms();
    expect(lobbyCalls()).toEqual(['lobby:subscribe']);

    first.unmount();
    expect(lobbyCalls()).toEqual(['lobby:subscribe']);

    second.unmount();
    expect(lobbyCalls()).toEqual(['lobby:subscribe', 'lobby:unsubscribe']);
  });

  it('adds new rooms, marking the ones hosted by people you follow, and puts them first', async () => {
    const { result } = renderLiveRooms();
    await waitFor(() => expect(listedIds(result)).toEqual(['a']));

    push('rooms:upsert', { room: card('new', { createdAt: '2026-11-01T09:00:00.000Z' }) });
    await waitFor(() => expect(listedIds(result)).toEqual(['a', 'new']));
    push('rooms:upsert', {
      room: card('mine', {
        host: { ...card('x').host, id: 'followed-host' },
        createdAt: '2026-10-01T09:00:00.000Z',
      }),
    });

    await waitFor(() => expect(listedIds(result)).toEqual(['mine', 'a', 'new']));
    expect(result.current.data?.pages[0]!.rooms[0]!.hostFollowed).toBe(true);
  });

  it('updates a room in place and removes closed ones', async () => {
    const { result } = renderLiveRooms();
    await waitFor(() => expect(listedIds(result)).toEqual(['a']));

    push('rooms:upsert', { room: card('a', { memberCount: 6 }) });
    await waitFor(() => expect(result.current.data?.pages[0]!.rooms[0]!.memberCount).toBe(6));

    push('rooms:remove', { roomId: 'a' });
    await waitFor(() => expect(listedIds(result)).toEqual([]));
  });

  it('subscribes again and refetches once after a reconnect', async () => {
    const { result } = renderLiveRooms();
    await waitFor(() => expect(listedIds(result)).toEqual(['a']));
    listPublic.mockResolvedValue({ rooms: [summary('a'), summary('missed')], nextPage: null });

    socket.connected = false;
    act(() => socket.connect());

    await waitFor(() => expect(listedIds(result)).toEqual(['a', 'missed']));
    expect(listPublic).toHaveBeenCalledTimes(2);
    expect(lobbyCalls()).toEqual(['lobby:subscribe', 'lobby:subscribe']);
  });

  it('doesn’t refetch when the socket connects for the first time', async () => {
    socket = fakeSocket(false);
    status = 'connecting';
    const { result } = renderLiveRooms();
    await waitFor(() => expect(listedIds(result)).toEqual(['a']));
    expect(lobbyCalls()).toEqual([]);

    act(() => socket.connect());

    expect(lobbyCalls()).toEqual(['lobby:subscribe']);
    expect(listPublic).toHaveBeenCalledTimes(1);
  });
});
