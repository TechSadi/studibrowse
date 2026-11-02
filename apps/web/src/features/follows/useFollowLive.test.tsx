import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowLive } from '@studibrowse/shared';
import { useFollowLive } from './useFollowLive';

let socket: object | null;
let status: 'connecting' | 'connected' | 'reconnecting';
const listeners = new Map<string, (payload: FollowLive) => void>();

vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({ socket, status }),
  useSocketEvent: (event: string, handler: (payload: FollowLive) => void) => {
    listeners.set(event, handler);
  },
}));

const emitWithAck = vi.fn();
vi.mock('../../lib/socket', () => ({
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const room = { id: 'r1', name: 'Late-night exam grind', isHost: true };

beforeEach(() => {
  socket = {};
  status = 'connected';
  emitWithAck.mockResolvedValue({
    live: [
      { userId: 'maya', room },
      { userId: 'jordan', room: null },
    ],
  });
});

afterEach(() => {
  cleanup();
  listeners.clear();
  emitWithAck.mockReset();
});

describe('useFollowLive', () => {
  it('watches the people you follow and keeps those in a public room', async () => {
    const { result } = renderHook(() => useFollowLive(['maya', 'jordan']));
    await waitFor(() => expect(result.current.get('maya')).toEqual(room));
    expect(emitWithAck).toHaveBeenCalledWith('follows:watch', {});
    expect(result.current.has('jordan')).toBe(false);
  });

  it('applies follows:live as people enter and leave rooms', async () => {
    const { result } = renderHook(() => useFollowLive(['maya', 'jordan']));
    await waitFor(() => expect(result.current.size).toBe(1));

    const other = { id: 'r2', name: 'Organic chem, together', isHost: false };
    act(() => listeners.get('follows:live')!({ userId: 'jordan', room: other }));
    expect(result.current.get('jordan')).toEqual(other);

    act(() => listeners.get('follows:live')!({ userId: 'maya', room: null }));
    expect(result.current.has('maya')).toBe(false);
  });

  it('watches again when who you follow changes', async () => {
    const { rerender } = renderHook(({ ids }) => useFollowLive(ids), { initialProps: { ids: ['maya'] } });
    await waitFor(() => expect(emitWithAck).toHaveBeenCalledTimes(1));
    rerender({ ids: ['maya', 'sofia'] });
    await waitFor(() => expect(emitWithAck).toHaveBeenCalledTimes(2));
  });

  it('waits for the socket to connect', () => {
    status = 'connecting';
    renderHook(() => useFollowLive(['maya']));
    expect(emitWithAck).not.toHaveBeenCalled();
  });

  it('shows no dots when the watch fails', async () => {
    emitWithAck.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFollowLive(['maya']));
    await waitFor(() => expect(emitWithAck).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});
