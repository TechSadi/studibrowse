import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationBellButton } from './NotificationBell';

vi.mock('./queries', () => ({
  useNotifications: () => ({ isPending: false, isError: false, data: { pages: [{ notifications: [] }] } }),
  useUnreadCount: () => ({ data: 2 }),
  useMarkRead: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../lib/browserNotifications', () => ({
  browserPermission: () => 'granted',
  isPromptDismissed: () => true,
  dismissPrompt: vi.fn(),
  requestBrowserPermission: vi.fn(),
}));

function renderBell() {
  render(
    <MemoryRouter>
      <NotificationBellButton />
      <button type="button">After the bell</button>
    </MemoryRouter>,
  );
  return screen.getByRole('button', { name: 'Notifications, 2 unread' });
}

afterEach(cleanup);

describe('NotificationBell', () => {
  it('moves focus into the panel when it opens', () => {
    fireEvent.click(renderBell());
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark all read' }));
  });

  it('keeps Tab inside the panel', () => {
    fireEvent.click(renderBell());
    const seeAll = screen.getByRole('link', { name: 'See all notifications' });
    seeAll.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark all read' }));

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(seeAll);
  });

  it('closes on Escape and gives focus back to the bell', () => {
    const bell = renderBell();
    fireEvent.click(bell);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(bell);
  });
});
