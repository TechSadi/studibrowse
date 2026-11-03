import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowLiveRoom } from '@studibrowse/shared';
import { FollowingList } from './FollowingList';

let live: Map<string, FollowLiveRoom>;
vi.mock('../../features/follows/useFollowLive', () => ({ useFollowLive: () => live }));

function fakeFetch(input: string) {
  if (input === '/api/users/me/following') {
    return Response.json({
      users: [
        { id: 'maya', name: 'Maya Kapoor', username: 'mayak', avatarColor: 'gold' },
        { id: 'jordan', name: 'Jordan Lee', username: 'jordanl', avatarColor: 'blue' },
        { id: 'riley', name: 'Riley Lewis', username: 'rileyl', avatarColor: 'purple' },
      ],
    });
  }
  throw new Error(`Unexpected request: ${input}`);
}

beforeEach(() => {
  live = new Map();
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FollowingList following={['maya', 'jordan', 'riley']} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FollowingList live dots', () => {
  it('links someone in a public room to that room, with a dot and a hint', async () => {
    live = new Map([
      ['maya', { id: 'r1', name: 'Late-night exam grind', isHost: true }],
      ['jordan', { id: 'r2', name: 'Organic chem, together', isHost: false }],
    ]);
    renderList();

    const maya = await screen.findByRole('link', { name: /Maya Kapoor/ });
    expect(maya.getAttribute('href')).toBe('/room/r1');
    expect(maya.getAttribute('title')).toBe('Hosting Late-night exam grind. Click to join.');
    expect(maya.querySelector('i')).not.toBeNull();

    const jordan = screen.getByRole('link', { name: /Jordan Lee/ });
    expect(jordan.getAttribute('title')).toBe('Studying in Organic chem, together. Click to join.');
  });

  it('links someone who isn’t in a room to their profile, without a dot', async () => {
    renderList();
    const riley = await screen.findByRole('link', { name: /Riley Lewis/ });
    expect(riley.getAttribute('href')).toBe('/u/rileyl');
    expect(riley.querySelector('i')).toBeNull();
    expect(riley.hasAttribute('title')).toBe(false);
  });
});
