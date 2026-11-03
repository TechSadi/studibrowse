import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { reportError } from '../lib/errorTracking';
import { RouteErrorPage } from './RouteErrorPage';

vi.mock('../lib/errorTracking', () => ({ reportError: vi.fn() }));

function Broken(): never {
  throw new Error('render failed');
}

describe('RouteErrorPage', () => {
  it('replaces a screen that threw and reports the error', async () => {
    // React logs caught render errors to the console; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createMemoryRouter([{ path: '/', element: <Broken />, ErrorBoundary: RouteErrorPage }]);
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'render failed' }));
  });
});
