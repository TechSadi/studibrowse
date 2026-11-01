import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus as Status } from '../../lib/socket';
import { ConnectionStatus } from './ConnectionStatus';

const snapshot = vi.hoisted(() => ({ socket: null, status: 'connecting' as Status }));

vi.mock('../../hooks/useSocket', () => ({ useSocket: () => snapshot }));

afterEach(() => {
  cleanup();
  snapshot.status = 'connecting';
});

describe('ConnectionStatus', () => {
  it.each<Status>(['connecting', 'connected'])('shows nothing while %s', (status) => {
    snapshot.status = status;
    render(<ConnectionStatus />);
    expect(screen.getByRole('status').childElementCount).toBe(0);
  });

  it('says it is reconnecting when the connection dropped', () => {
    snapshot.status = 'reconnecting';
    render(<ConnectionStatus />);
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…');
  });

  it('says it is offline when the browser has no network', () => {
    snapshot.status = 'offline';
    render(<ConnectionStatus />);
    expect(screen.getByRole('status').textContent).toBe('Offline');
  });
});
