import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidePanel } from './SidePanel';

const panes = {
  chat: <button type="button">Send</button>,
  goals: <button type="button">Add goal</button>,
  people: null,
  files: null,
};

function renderPanel(props: { drawer: boolean; open: boolean; onClose?: () => void }) {
  return render(
    <>
      <button type="button">Outside</button>
      <SidePanel tab="chat" onTabChange={vi.fn()} counts={{}} panes={panes} onClose={vi.fn()} {...props} />
    </>,
  );
}

afterEach(cleanup);

describe('SidePanel', () => {
  it('is a modal dialog only while open as a drawer', () => {
    const { rerender } = renderPanel({ drawer: false, open: false });
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <SidePanel tab="chat" onTabChange={vi.fn()} counts={{}} panes={panes} onClose={vi.fn()} drawer open />,
    );
    expect(screen.getByRole('dialog', { name: 'Room panel' }).getAttribute('aria-modal')).toBe('true');
  });

  it('moves focus in and keeps Tab inside the open drawer, skipping hidden panes', () => {
    renderPanel({ drawer: true, open: true });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    expect(document.activeElement).toBe(chatTab);

    // The last reachable control is Send in the chat pane; Add goal sits in a hidden pane.
    screen.getByRole('button', { name: 'Send' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(chatTab);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send' }));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderPanel({ drawer: true, open: true, onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
