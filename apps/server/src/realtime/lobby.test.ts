import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyRoomCard } from '@studibrowse/shared';
import { loadRoomCard, type RoomCardState } from '../modules/rooms/rooms.service';
import { broadcastRoomCard, LOBBY_COALESCE_MS, removeRoomCard, resetLobby } from './lobby';
import { LOBBY_CHANNEL, type TypedServer } from './types';

vi.mock('../modules/rooms/rooms.service', () => ({ loadRoomCard: vi.fn() }));

const load = vi.mocked(loadRoomCard);
const emit = vi.fn();
const to = vi.fn(() => ({ emit }));
const io = { to } as unknown as TypedServer;

function card(id: string, memberCount: number): LobbyRoomCard {
  return {
    id,
    name: 'Finals week focus',
    subject: 'Maths',
    host: { id: 'u1', name: 'Maya Kapoor', username: 'maya', avatarColor: 'gold' },
    isPublic: true,
    maxSize: 10,
    memberCount,
    isLive: memberCount > 0,
    timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: false,
    },
    createdAt: '2026-11-01T12:00:00.000Z',
  };
}

/** Each read's card has memberCount = how many reads so far, so every send shows which read it came from. */
function countingReads() {
  let reads = 0;
  load.mockImplementation(async (roomId) => {
    reads += 1;
    return { kind: 'listed', card: card(roomId, reads) };
  });
}

const sent = () => emit.mock.calls.map(([event, payload]) => [event, payload] as const);
const upsertCounts = () => sent().map(([, payload]) => (payload as { room: LobbyRoomCard }).room.memberCount);

beforeEach(() => {
  vi.useFakeTimers();
  load.mockReset();
  emit.mockReset();
  to.mockClear();
});

afterEach(() => {
  resetLobby();
  vi.useRealTimers();
});

describe('broadcastRoomCard', () => {
  it('sends the first change at once, to the lobby', async () => {
    countingReads();
    broadcastRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(0);

    expect(to).toHaveBeenCalledWith(LOBBY_CHANNEL);
    expect(sent()).toEqual([['rooms:upsert', { room: card('r1', 1) }]]);
  });

  it('folds a burst into the first send and one trailing send with the latest card', async () => {
    countingReads();
    for (let i = 0; i < 5; i++) {
      broadcastRoomCard(io, 'r1');
      await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS / 5 - 1);
    }
    expect(upsertCounts()).toEqual([1]);

    await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS);
    expect(upsertCounts()).toEqual([1, 2]);

    // Nothing changed after that, so nothing more is sent.
    await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS * 3);
    expect(upsertCounts()).toEqual([1, 2]);
  });

  it('never sends more than one card per room per second', async () => {
    countingReads();
    const sentAt: number[] = [];
    emit.mockImplementation(() => sentAt.push(Date.now()));
    for (let i = 0; i < 40; i++) {
      broadcastRoomCard(io, 'r1');
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS);

    expect(sentAt.length).toBeGreaterThan(1);
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i]! - sentAt[i - 1]!).toBeGreaterThanOrEqual(LOBBY_COALESCE_MS);
    }
  });

  it('keeps each room’s window separate', async () => {
    load.mockImplementation(async (roomId) => ({ kind: 'listed', card: card(roomId, 1) }));
    broadcastRoomCard(io, 'r1');
    broadcastRoomCard(io, 'r2');
    await vi.advanceTimersByTimeAsync(0);

    expect(sent().map(([, payload]) => (payload as { room: LobbyRoomCard }).room.id)).toEqual(['r1', 'r2']);
  });

  it('sends rooms:remove for a room that closed', async () => {
    load.mockResolvedValue({ kind: 'closed' });
    broadcastRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(0);

    expect(sent()).toEqual([['rooms:remove', { roomId: 'r1' }]]);
  });

  it('sends nothing for a private room', async () => {
    load.mockResolvedValue({ kind: 'hidden' });
    broadcastRoomCard(io, 'r1');
    broadcastRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS * 2);

    expect(load).toHaveBeenCalledTimes(2);
    expect(emit).not.toHaveBeenCalled();
  });

  it('logs a failed read and carries on', async () => {
    countingReads();
    load.mockRejectedValueOnce(new Error('db down'));
    broadcastRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS + 1);
    expect(emit).not.toHaveBeenCalled();

    broadcastRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(upsertCounts()).toEqual([1]);
  });
});

describe('removeRoomCard', () => {
  it('sends rooms:remove at once and drops a waiting send', async () => {
    countingReads();
    broadcastRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(0);
    broadcastRoomCard(io, 'r1');

    removeRoomCard(io, 'r1');
    await vi.advanceTimersByTimeAsync(LOBBY_COALESCE_MS * 2);

    expect(sent().map(([event]) => event)).toEqual(['rooms:upsert', 'rooms:remove']);
  });

  it('drops a card that was still being read when the room went private', async () => {
    let finishRead: (state: RoomCardState) => void = () => undefined;
    load.mockImplementation(() => new Promise((resolve) => (finishRead = resolve)));
    broadcastRoomCard(io, 'r1');

    removeRoomCard(io, 'r1');
    finishRead({ kind: 'listed', card: card('r1', 1) });
    await vi.advanceTimersByTimeAsync(0);

    expect(sent()).toEqual([['rooms:remove', { roomId: 'r1' }]]);
  });
});
