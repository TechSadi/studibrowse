import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TYPING_CLEAR_MS, TYPING_THROTTLE_MS, type ChatMessage } from '@studibrowse/shared';
import { useRoomChat } from './useRoomChat';

// The latest listener the hook registered for each event, so tests can play the server.
const listeners = new Map<string, (payload: never) => void>();
vi.mock('../../../hooks/useSocket', () => ({
  useSocketEvent: (event: string, handler: (payload: never) => void) => {
    listeners.set(event, handler);
  },
}));

const emit = vi.fn();
const emitWithAck = vi.fn();
vi.mock('../../../lib/socket', () => ({
  getSocket: () => ({ emit }),
  emitWithAck: (...args: unknown[]) => emitWithAck(...args) as unknown,
}));

const ROOM = 'room-1';
const ME = 'me';

function message(id: string, userId = 'hana', roomId = ROOM): ChatMessage {
  return { id, roomId, userId, text: `message ${id}`, createdAt: '2026-01-05T19:05:00.000Z' };
}

function serverSends(event: 'chat:new', payload: { message: ChatMessage }): void;
function serverSends(
  event: 'chat:typing',
  payload: { roomId: string; userId: string; isTyping: boolean },
): void;
function serverSends(event: string, payload: unknown) {
  act(() => (listeners.get(event) as (payload: unknown) => void)(payload));
}

const typing = (userId: string, isTyping = true, roomId = ROOM) =>
  serverSends('chat:typing', { roomId, userId, isTyping });

function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderChat(initial: ChatMessage[] = []) {
  return renderHook(({ messages }) => useRoomChat(ROOM, messages, ME), {
    initialProps: { messages: initial },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  listeners.clear();
  emit.mockReset();
  emitWithAck.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('messages', () => {
  it('starts from the join messages and adds new ones for this room', () => {
    const { result } = renderChat([message('1')]);

    serverSends('chat:new', { message: message('2') });
    serverSends('chat:new', { message: message('3', 'hana', 'other-room') });

    expect(result.current.messages.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('skips a message it already has', () => {
    const { result } = renderChat([message('1')]);
    serverSends('chat:new', { message: message('1') });
    expect(result.current.messages).toHaveLength(1);
  });

  it('adds your own message from the ack, and not again when chat:new repeats it', async () => {
    const mine = message('9', ME);
    emitWithAck.mockResolvedValue({ message: mine });
    const { result } = renderChat();

    await act(() => result.current.send('hello'));
    serverSends('chat:new', { message: mine });

    expect(emitWithAck).toHaveBeenCalledWith('chat:send', { roomId: ROOM, text: 'hello' });
    expect(result.current.messages).toEqual([mine]);
  });

  it('passes on the error when a message is refused', async () => {
    emitWithAck.mockRejectedValue(new Error('You’re sending messages too fast.'));
    const { result } = renderChat();

    await expect(act(() => result.current.send('hello'))).rejects.toThrow('too fast');
    expect(result.current.messages).toEqual([]);
  });
});

describe('who is typing', () => {
  it('shows someone for TYPING_CLEAR_MS after their last chat:typing', () => {
    const { result } = renderChat();

    typing('hana');
    expect(result.current.typingUserIds).toEqual(['hana']);

    elapse(TYPING_CLEAR_MS - 1);
    expect(result.current.typingUserIds).toEqual(['hana']);
    elapse(1);
    expect(result.current.typingUserIds).toEqual([]);
  });

  it('keeps showing someone who keeps typing', () => {
    const { result } = renderChat();

    typing('hana');
    elapse(TYPING_CLEAR_MS - 500);
    typing('hana');
    elapse(TYPING_CLEAR_MS - 500);

    expect(result.current.typingUserIds).toEqual(['hana']);
    elapse(500);
    expect(result.current.typingUserIds).toEqual([]);
  });

  it('clears someone at once when they stop or their message arrives', () => {
    const { result } = renderChat();
    typing('hana');
    typing('riley');

    typing('hana', false);
    expect(result.current.typingUserIds).toEqual(['riley']);

    serverSends('chat:new', { message: message('1', 'riley') });
    expect(result.current.typingUserIds).toEqual([]);
  });

  it('ignores yourself and other rooms', () => {
    const { result } = renderChat();
    typing(ME);
    typing('hana', true, 'other-room');
    expect(result.current.typingUserIds).toEqual([]);
  });
});

describe('telling the room you are typing', () => {
  it('sends isTyping: true at most once per TYPING_THROTTLE_MS', () => {
    const { result } = renderChat();
    const keystrokes = (...drafts: string[]) =>
      act(() => drafts.forEach((d) => result.current.notifyTyping(d)));

    keystrokes('h', 'he', 'hel');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith('chat:typing', { roomId: ROOM, isTyping: true });

    elapse(TYPING_THROTTLE_MS - 1);
    keystrokes('hell');
    expect(emit).toHaveBeenCalledTimes(1);

    elapse(1);
    keystrokes('hello');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('sends isTyping: false once when the draft is cleared, and nothing if you never started', () => {
    const { result } = renderChat();

    act(() => result.current.notifyTyping('   '));
    expect(emit).not.toHaveBeenCalled();

    act(() => result.current.notifyTyping('hi'));
    act(() => result.current.notifyTyping(''));
    act(() => result.current.notifyTyping(''));
    expect(emit.mock.calls).toEqual([
      ['chat:typing', { roomId: ROOM, isTyping: true }],
      ['chat:typing', { roomId: ROOM, isTyping: false }],
    ]);

    // Typing again right away is a new start, not throttled.
    act(() => result.current.notifyTyping('h'));
    expect(emit).toHaveBeenLastCalledWith('chat:typing', { roomId: ROOM, isTyping: true });
  });

  it('stops typing when you send, and when you leave mid-sentence', async () => {
    emitWithAck.mockResolvedValue({ message: message('1', ME) });
    const { result, unmount } = renderChat();

    act(() => result.current.notifyTyping('hi'));
    await act(() => result.current.send('hi'));
    expect(emit).toHaveBeenLastCalledWith('chat:typing', { roomId: ROOM, isTyping: false });

    act(() => result.current.notifyTyping('another'));
    emit.mockClear();
    unmount();
    expect(emit).toHaveBeenCalledWith('chat:typing', { roomId: ROOM, isTyping: false });
  });
});
