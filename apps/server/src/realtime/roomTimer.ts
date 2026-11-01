// Runs the timer engine for live rooms: host commands, one timeout per running room, and the restart catch-up.
// See docs/ARCHITECTURE.md › Timer.
import { createKeyedLock } from '../lib/keyedLock';
import { logger } from '../lib/logger';
import { roomClosed } from '../modules/rooms/rooms.errors';
import { toRoomTimer } from '../modules/rooms/rooms.serializer';
import {
  findRunningTimers,
  loadTimerRoom,
  mergeFocusCredits,
  saveTimer,
  type TimerRoom,
  type TimerRun,
} from '../modules/rooms/roomTimer.service';
import { broadcastPresence } from './broadcast';
import { applyPhaseStatus, focusCredits } from './presence';
import {
  advanceSteps,
  focusRunMs,
  isPaused,
  pause,
  phaseDurationMs,
  reset,
  resume,
  skip,
  start,
  type TimerState,
} from './timer';
import { roomChannel, type TypedServer } from './types';

export type TimerCommand = 'start' | 'pause' | 'skip' | 'reset';

export interface RoomTimerOptions {
  /** The clock. Tests can replace it. */
  now?: () => Date;
}

export interface RoomTimer {
  /** Applies a host command. The caller has already checked the sender is the room's host. */
  command: (io: TypedServer, roomId: string, command: TimerCommand) => Promise<void>;
  /** Schedules every running timer from the database, catching up on phases that ended while we were down. */
  restore: (io: TypedServer) => Promise<void>;
  /** Cancels every scheduled timeout, for shutdown and tests. */
  dispose: () => void;
}

interface Outcome {
  timer: TimerState;
  run: TimerRun;
  /** Whether anyone's status moved with the phase, so the room needs a presence:update. */
  statusChanged: boolean;
}

export function createRoomTimer({ now = () => new Date() }: RoomTimerOptions = {}): RoomTimer {
  const timeouts = new Map<string, NodeJS.Timeout>();
  // A command and a firing timeout for the same room must not interleave their load → save.
  const withRoom = createKeyedLock();

  function cancel(roomId: string): void {
    clearTimeout(timeouts.get(roomId));
    timeouts.delete(roomId);
  }

  function schedule(io: TypedServer, roomId: string, endsAt: Date): void {
    cancel(roomId);
    const timeout = setTimeout(
      () => {
        timeouts.delete(roomId);
        void phaseEnded(io, roomId);
      },
      Math.max(0, endsAt.getTime() - now().getTime()),
    );
    timeout.unref();
    timeouts.set(roomId, timeout);
  }

  function publish(io: TypedServer, roomId: string, { timer, statusChanged }: Outcome): void {
    if (timer.endsAt) schedule(io, roomId, timer.endsAt);
    else cancel(roomId);
    if (statusChanged) broadcastPresence(io, roomId);
    io.to(roomChannel(roomId)).emit('timer:state', {
      roomId,
      timer: toRoomTimer(timer),
      serverNow: now().getTime(),
    });
  }

  function applyCommand(roomId: string, room: TimerRoom, command: TimerCommand, at: Date): Outcome {
    const { timer, timerSettings: settings } = room;
    let run = room.run;
    let next: TimerState;
    if (command === 'start') {
      // One button: Start from idle or done, Resume when paused (including a phase waiting for the host).
      if (isPaused(timer)) {
        next = resume(timer, settings, at);
      } else {
        next = start(timer, settings, at);
        run = { startedAt: at, focus: [] };
      }
    } else if (command === 'pause') {
      next = pause(timer, settings, at);
    } else if (command === 'skip') {
      next = skip(timer, settings, at);
      if (timer.phase === 'focus') {
        run = mergeFocusCredits(run, focusCredits(roomId, at, focusRunMs(timer, settings, at)));
      }
    } else {
      next = reset(timer, settings, at);
    }
    const statusChanged = next.phase !== timer.phase && applyPhaseStatus(roomId, next.phase, at);
    return { timer: next, run, statusChanged };
  }

  async function command(io: TypedServer, roomId: string, name: TimerCommand): Promise<void> {
    await withRoom(roomId, async () => {
      const room = await loadTimerRoom(roomId);
      if (room.closedAt) throw roomClosed();
      const outcome = applyCommand(roomId, room, name, now());
      await saveTimer(roomId, outcome.timer, outcome.run);
      publish(io, roomId, outcome);
    });
  }

  /**
   * A room's `endsAt` passed. Walks through every phase that ended (more than one only after an outage),
   * crediting focus and moving statuses at the moment each phase ended. An early or stale timeout is harmless.
   */
  async function phaseEnded(io: TypedServer, roomId: string): Promise<void> {
    try {
      await withRoom(roomId, async () => {
        const room = await loadTimerRoom(roomId);
        if (room.closedAt) return;
        const steps = advanceSteps(room.timer, room.timerSettings, now());
        if (steps.length === 0) {
          if (room.timer.endsAt) schedule(io, roomId, room.timer.endsAt);
          return;
        }

        let previous = room.timer;
        let run = room.run;
        let statusChanged = false;
        for (const step of steps) {
          // Every step ends a running phase, so `previous.endsAt` is set.
          const endedAt = previous.endsAt!;
          if (previous.phase === 'focus') {
            const ranMs = phaseDurationMs('focus', room.timerSettings);
            run = mergeFocusCredits(run, focusCredits(roomId, endedAt, ranMs));
          }
          statusChanged = applyPhaseStatus(roomId, step.phase, endedAt) || statusChanged;
          previous = step;
        }
        await saveTimer(roomId, previous, run);
        publish(io, roomId, { timer: previous, run, statusChanged });
      });
    } catch (err) {
      logger.error({ err, roomId }, 'failed to advance a room timer');
    }
  }

  async function restore(io: TypedServer): Promise<void> {
    for (const { roomId, endsAt } of await findRunningTimers()) schedule(io, roomId, endsAt);
  }

  function dispose(): void {
    for (const timeout of timeouts.values()) clearTimeout(timeout);
    timeouts.clear();
  }

  return { command, restore, dispose };
}
