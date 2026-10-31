import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USERNAME_CHECK_DELAY_MS, useUsernameAvailability } from './useUsernameAvailability';

let fetchMock: ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderCheck(initial: string) {
  return renderHook(({ username }) => useUsernameAvailability(username), {
    wrapper,
    initialProps: { username: initial },
  });
}

/**
 * Lets the debounce timer fire, then the stubbed fetch resolve. TanStack Query batches its updates on a
 * setTimeout(0), so the clock has to move a little past the debounce as well.
 */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(USERNAME_CHECK_DELAY_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useUsernameAvailability', () => {
  it('is idle for an empty username', () => {
    const { result } = renderCheck('');
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('checks once typing pauses, not on every keystroke', async () => {
    fetchMock.mockResolvedValue(Response.json({ available: true }));
    const { result, rerender } = renderCheck('');

    rerender({ username: 'ale' });
    rerender({ username: 'alex' });
    expect(result.current).toEqual({ status: 'checking' });
    expect(fetchMock).not.toHaveBeenCalled();

    await settle();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/username-available?u=alex');
    expect(result.current).toEqual({ status: 'available' });
  });

  it('reports a taken username', async () => {
    fetchMock.mockResolvedValue(Response.json({ available: false }));
    const { result, rerender } = renderCheck('');
    rerender({ username: 'maya' });
    await settle();
    expect(result.current).toEqual({ status: 'taken' });
  });

  it('skips the request and shows the schema message for invalid usernames', async () => {
    const { result, rerender } = renderCheck('');
    rerender({ username: 'al' });
    await settle();
    expect(result.current).toEqual({ status: 'invalid', message: 'Usernames need at least 3 characters.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to an error state when the check fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result, rerender } = renderCheck('');
    rerender({ username: 'alex' });
    await settle();
    expect(result.current).toEqual({ status: 'error' });
  });
});
