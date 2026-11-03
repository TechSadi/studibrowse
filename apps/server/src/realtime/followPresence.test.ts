import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../lib/logger';
import { findOpenPublicRooms } from '../modules/rooms/rooms.service';
import { broadcastFollowLive, liveStateOf } from './followPresence';
import { addSocket, resetPresence } from './presence';
import type { TypedServer } from './types';

vi.mock('../modules/rooms/rooms.service', () => ({ findOpenPublicRooms: vi.fn() }));

const PUBLIC_ROOM = 'room-public';
const PRIVATE_ROOM = 'room-private';
let socketCount = 0;

function enter(roomId: string, userId: string, hostId: string) {
  socketCount += 1;
  addSocket(roomId, `socket-${socketCount}`, {
    userId,
    profile: { name: userId, username: userId, avatarColor: 'green' },
    status: 'focusing',
    maxSize: 10,
    hostId,
    now: new Date(),
  });
}

/** A Socket.IO server stand-in that records `io.to(channel).emit(event, payload)`. */
function recordingIo() {
  const sent: { channel: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (channel: string) => ({
      emit: (event: string, payload: unknown) => sent.push({ channel, event, payload }),
    }),
  } as unknown as TypedServer;
  return { io, sent };
}

/** Lets the keyed lock's queued sends run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  resetPresence();
  vi.mocked(findOpenPublicRooms).mockReset();
  vi.restoreAllMocks();
});

describe('liveStateOf', () => {
  it('returns nothing for nobody, without a database lookup', async () => {
    vi.mocked(findOpenPublicRooms).mockResolvedValue([]);
    expect(await liveStateOf([])).toEqual([]);
    expect(findOpenPublicRooms).toHaveBeenCalledWith([]);
  });

  it('names the public room when someone is in a private one too, and never the private one', async () => {
    enter(PRIVATE_ROOM, 'ana', 'ana');
    enter(PUBLIC_ROOM, 'ana', 'ben');
    vi.mocked(findOpenPublicRooms).mockResolvedValue([{ id: PUBLIC_ROOM, name: 'Late-night maths' }]);

    expect(await liveStateOf(['ana', 'cal'])).toEqual([
      { userId: 'ana', room: { id: PUBLIC_ROOM, name: 'Late-night maths', isHost: false } },
      { userId: 'cal', room: null },
    ]);
  });

  it('says when the person hosts the room', async () => {
    enter(PUBLIC_ROOM, 'ben', 'ben');
    vi.mocked(findOpenPublicRooms).mockResolvedValue([{ id: PUBLIC_ROOM, name: 'Late-night maths' }]);
    expect(await liveStateOf(['ben'])).toEqual([
      { userId: 'ben', room: { id: PUBLIC_ROOM, name: 'Late-night maths', isHost: true } },
    ]);
  });
});

describe('broadcastFollowLive', () => {
  it('tells each person’s watchers where they are', async () => {
    enter(PUBLIC_ROOM, 'ana', 'ana');
    vi.mocked(findOpenPublicRooms).mockImplementation(async (ids) =>
      ids.includes(PUBLIC_ROOM) ? [{ id: PUBLIC_ROOM, name: 'Late-night maths' }] : [],
    );
    const { io, sent } = recordingIo();

    broadcastFollowLive(io, ['ana', 'ben']);
    await flush();

    expect(sent).toEqual([
      {
        channel: 'watch:ana',
        event: 'follows:live',
        payload: { userId: 'ana', room: { id: PUBLIC_ROOM, name: 'Late-night maths', isHost: true } },
      },
      { channel: 'watch:ben', event: 'follows:live', payload: { userId: 'ben', room: null } },
    ]);
  });

  it('logs a failed lookup instead of throwing', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.mocked(findOpenPublicRooms).mockRejectedValue(new Error('database down'));
    const { io, sent } = recordingIo();

    broadcastFollowLive(io, ['ana']);
    await flush();

    expect(sent).toEqual([]);
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana' }),
      'failed to tell followers where someone is',
    );
  });
});
