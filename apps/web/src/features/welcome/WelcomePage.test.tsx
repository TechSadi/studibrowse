import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomePage } from './WelcomePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WelcomePage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WelcomePage', () => {
  it('shows the database status from /api/health', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, db: 'up' })));
    renderPage();
    expect(screen.getByRole('heading', { name: 'StudiBrowse' })).toBeDefined();
    expect(await screen.findByText('Server up, database up.')).toBeDefined();
  });

  it('shows an error when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderPage();
    expect(await screen.findByText('Server unreachable.')).toBeDefined();
  });
});
