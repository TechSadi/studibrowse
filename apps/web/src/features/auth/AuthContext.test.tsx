import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeUser } from '../../test/renderRoutes';
import { AuthProvider, useAuth } from './AuthContext';

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Any zone that isn't the browser's.
const otherZone = browserZone === 'Asia/Tokyo' ? 'Europe/London' : 'Asia/Tokyo';

let patches: unknown[];

function stubApi(user: PublicUser, { patchFails = false } = {}) {
  patches = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init: RequestInit = {}) => {
      const route = `${init.method ?? 'GET'} ${input}`;
      if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
      if (route === 'PATCH /api/users/me') {
        const body = JSON.parse(init.body as string) as Partial<PublicUser>;
        patches.push(body);
        if (patchFails) return Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 });
        return Response.json({ user: { ...user, ...body } });
      }
      throw new Error(`Unexpected request: ${route}`);
    }),
  );
}

function SavedZone() {
  const { state } = useAuth();
  return <p>{state.status === 'signedIn' ? state.user.timeZone : state.status}</p>;
}

function renderProvider() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <SavedZone />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('AuthProvider time zone', () => {
  it('saves the browser’s time zone when it differs from the saved one', async () => {
    stubApi(makeUser({ timeZone: otherZone }));
    renderProvider();
    expect(await screen.findByText(browserZone)).toBeDefined();
    expect(patches).toEqual([{ timeZone: browserZone }]);
  });

  it('sends nothing when they already match', async () => {
    stubApi(makeUser({ timeZone: browserZone }));
    renderProvider();
    await screen.findByText(browserZone);
    expect(patches).toEqual([]);
  });

  it('keeps the saved zone when the update fails', async () => {
    stubApi(makeUser({ timeZone: otherZone }), { patchFails: true });
    renderProvider();
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(screen.getByText(otherZone)).toBeDefined();
  });
});
