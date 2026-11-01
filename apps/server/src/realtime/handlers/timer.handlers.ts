import { onEvent } from '../handler';
import type { RoomTimer, TimerCommand } from '../roomTimer';
import type { HandlerRegistrar } from '../types';
import { requireHost } from './room.handlers';

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
