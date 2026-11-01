import { notHost } from '../../modules/rooms/rooms.errors';
import { onEvent } from '../handler';
import { getHostId } from '../presence';
import type { RoomTimer, TimerCommand } from '../roomTimer';
import type { HandlerRegistrar, TypedSocket } from '../types';
import { requireSocketInRoom } from './room.handlers';

const COMMANDS = {
  'timer:start': 'start',
  'timer:pause': 'pause',
  'timer:skip': 'skip',
  'timer:reset': 'reset',
} as const satisfies Record<string, TimerCommand>;

/** timer:start (also resumes), timer:pause, timer:skip and timer:reset. Host only, checked on every call. */
export function createTimerHandlers(roomTimer: RoomTimer): HandlerRegistrar {
  return (io, socket) => {
    for (const [event, command] of Object.entries(COMMANDS) as [keyof typeof COMMANDS, TimerCommand][]) {
      onEvent(io, socket, event, async ({ roomId }, { userId }) => {
        requireHost(roomId, userId, socket);
        await roomTimer.command(io, roomId, command);
        return {};
      });
    }
  };
}

function requireHost(roomId: string, userId: string, socket: TypedSocket): void {
  requireSocketInRoom(roomId, socket);
  if (getHostId(roomId) !== userId) throw notHost();
}
