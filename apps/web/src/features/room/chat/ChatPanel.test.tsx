import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, PresenceMember } from '@studibrowse/shared';
import { ChatPanel } from './ChatPanel';

vi.mock('../../../hooks/useSocket', () => ({ useSocketEvent: () => undefined }));

const emitWithAck = vi.fn();
vi.mock('../../../lib/socket', () => ({
  getSocket: () => ({ emit: () => undefined }),
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const ROOM = 'room-1';
const ME = 'me';

const hana: PresenceMember = {
  userId: 'hana',
  name: 'Hana Ito',
  username: 'hana',
  avatarColor: 'green',
  status: 'break',
  workingOn: '',
  isHost: false,
  joinedAt: '2026-01-05T19:00:00.000Z',
  focusingSince: null,
};

function message(id: string, userId: string, text: string): ChatMessage {
  return { id, roomId: ROOM, userId, text, createdAt: '2026-01-05T19:05:00.000Z' };
}

function renderPanel(messages: ChatMessage[] = [], focusRound = false) {
  return render(
    <ChatPanel
      roomId={ROOM}
      initialMessages={messages}
      myUserId={ME}
      members={[hana]}
      focusRound={focusRound}
    />,
  );
}

beforeEach(() => {
  emitWithAck.mockReset();
});
afterEach(cleanup);

describe('ChatPanel', () => {
  it('shows who wrote each message, with yours as You', () => {
    renderPanel([message('1', 'hana', 'Thanks for the formula sheet'), message('2', ME, 'Any time')]);

    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Hana Ito');
    expect(items[0]?.textContent).toContain('Thanks for the formula sheet');
    expect(items[1]?.textContent).toContain('You');
  });

  it('names someone who has left as Someone', () => {
    renderPanel([message('1', 'gone', 'bye')]);
    expect(screen.getByRole('listitem').textContent).toContain('Someone');
  });

  it('has an empty state', () => {
    renderPanel();
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });

  it('sends the trimmed draft and clears it', async () => {
    emitWithAck.mockResolvedValue({ message: message('3', ME, 'hello') });
    renderPanel();
    const input = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
    expect(emitWithAck).toHaveBeenCalledWith('chat:send', { roomId: ROOM, text: 'hello' });
    expect(screen.getByRole('listitem').textContent).toContain('hello');
  });

  it('does not send a blank draft', () => {
    renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(emitWithAck).not.toHaveBeenCalled();
  });

  it('shows the server’s error and keeps the draft', async () => {
    emitWithAck.mockRejectedValue(new Error('You’re sending messages too fast.'));
    renderPanel();
    const input = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect((await screen.findByRole('alert')).textContent).toBe('You’re sending messages too fast.');
    expect((input as HTMLInputElement).value).toBe('hello');
  });

  it('asks for short messages during a focus round', () => {
    renderPanel([], true);
    expect(screen.getByText(/Keep messages short/)).toBeTruthy();
  });
});
