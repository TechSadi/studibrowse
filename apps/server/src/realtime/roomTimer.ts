// Runs the timer engine for live rooms: host commands, one timeout per running room, the restart catch-up, and
// each run's session log. See docs/ARCHITECTURE.md › Timer and › Sessions.
import { createKeyedLock } from '../lib/keyedLock';
import { logger } from '../lib/logger';
import { roomClosed } from '../modules/rooms/rooms.errors';
import { toRoomTimer } from '../modules/rooms/rooms.serializer';
import {
  emptyRun,
  findRunningTimers,
  isRunActive,
  loadTimerRoom,
  mergeFocusCredits,
  newRun,
  saveRun,
  saveTimer,
  withSessionId,
  type TimerRoom,
  type TimerRun,
} from '../modules/rooms/roomTimer.service';
import {
  finalizeSession,
  savePartialSession,
  type LoggedSession,
} from '../modules/sessions/sessions.service';
import { broadcastPresence } from './broadcast';
import { broadcastRoomCard } from './lobby';
import { applyPhaseStatus, drainFocus, setFocusRunning } from './presence';
import { advanceSteps, isPaused, pause, reset, resume, skip, start, type TimerState } from './timer';
import { roomChannel, type TypedServer } from './types';

export type TimerCommand = 'start' | 'pause' | 'skip' | 'reset';

export interface RoomTimerOptions {
  /** The clock. Tests can replace it. */
  now?: () => Date;
}

export interface RoomTimer {
  /** Applies a host command. The caller has already checked the sender is the room's host. */
  command: (io: TypedServer, roomId: string, command: TimerCommand) => Promise<void>;
  /**
   * Someone is leaving the room for good, at `at`: credits their focus so far and saves the run's session as
   * it stands. Call it before they are removed from presence.
   */
  memberLeaving: (roomId: string, userId: string, at: Date) => Promise<void>;
  /** The room is closing with a run still going: logs it as it stands, ending at `endedAt`. */
  finalizeOnClose: (roomId: string, endedAt: Date) => Promise<void>;
  /** Schedules every running timer from the database, catching up on phases that ended while we were down. */
  restore: (io: TypedServer) => Promise<void>;
  /** Cancels every scheduled timeout, for shutdown and tests. */
  dispose: () => void;
}

interface Outcome {
  timer: TimerState;
  run: TimerRun;
  /** The run that just ended (done or reset), to log. */
  ended: TimerRun | null;
  /** Whether anyone's status moved with the phase, so the room needs a presence:update. */
  statusChanged: boolean;
}

/** Focus time counts only while a focus phase is actually running. */
function isFocusRunning(timer: TimerState): boolean {
  return timer.phase === 'focus' && timer.endsAt !== null;
}

/** Presence follows the timer from `from` to `to` at `at`. Returns whether anyone's status changed. */
function followTimer(roomId: string, from: TimerState, to: TimerState, at: Date): boolean {
  setFocusRunning(roomId, isFocusRunning(to), at);
  return to.phase !== from.phase && applyPhaseStatus(roomId, to.phase, at);
}

function completeRound(run: TimerRun): TimerRun {
  return { ...run, roundsCompleted: run.roundsCompleted + 1 };
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

  function publish(
    io: TypedServer,
    roomId: string,
    { timer, statusChanged }: Outcome,
    logged: LoggedSession | null,
  ): void {
    if (timer.endsAt) schedule(io, roomId, timer.endsAt);
    else cancel(roomId);
    if (statusChanged) broadcastPresence(io, roomId);
    const channel = io.to(roomChannel(roomId));
    channel.emit('timer:state', { roomId, timer: toRoomTimer(timer), serverNow: now().getTime() });
    if (logged) channel.emit('session:logged', { roomId, ...logged });
    // Every change, not just new phases: a pause changes the card's text and the focus and break filters.
    broadcastRoomCard(io, roomId);
  }

  /** Saves the outcome, logging the run first if it ended. */
  async function settle(roomId: string, outcome: Outcome, endedAt: Date): Promise<LoggedSession | null> {
    const logged = outcome.ended ? await finalizeSession(roomId, outcome.ended, endedAt) : null;
    await saveTimer(roomId, outcome.timer, outcome.run);
    return logged;
  }

  function applyCommand(roomId: string, room: TimerRoom, command: TimerCommand, at: Date): Outcome {
    const { timer, timerSettings: settings } = room;
    let run = room.run;
    let next: TimerState;
    let startsRun = false;
    if (command === 'start') {
      // One button: Start from idle or done, Resume when paused (including a phase waiting for the host).
      if (isPaused(timer)) {
        next = resume(timer, settings, at);
      } else {
        next = start(timer, settings, at);
        startsRun = true;
      }
    } else if (command === 'pause') {
      next = pause(timer, settings, at);
    } else if (command === 'skip') {
      next = skip(timer, settings, at);
      if (timer.phase === 'focus') run = completeRound(run);
    } else {
      next = reset(timer, settings, at);
    }
    const statusChanged = followTimer(roomId, timer, next, at);
    run = mergeFocusCredits(run, drainFocus(roomId, at), at);

    const endsRun = (next.phase === 'done' && timer.phase !== 'done') || command === 'reset';
    const ended = endsRun && isRunActive(run) ? run : null;
    if (startsRun) run = newRun(at);
    else if (endsRun) run = emptyRun();
    return { timer: next, run, ended, statusChanged };
  }

  async function command(io: TypedServer, roomId: string, name: TimerCommand): Promise<void> {
    await withRoom(roomId, async () => {
      const room = await loadTimerRoom(roomId);
      if (room.closedAt) throw roomClosed();
      const at = now();
      const outcome = applyCommand(roomId, room, name, at);
      const logged = await settle(roomId, outcome, at);
      publish(io, roomId, outcome, logged);
    });
  }

  /**
   * A room's `endsAt` passed. Walks through every phase that ended (more than one only after an outage), moving
   * focus counting and statuses at the moment each phase ended. An early or stale timeout is harmless.
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
        let endedAt = now();
        for (const step of steps) {
          // Every step ends a running phase, so `previous.endsAt` is set.
          endedAt = previous.endsAt!;
          if (previous.phase === 'focus') run = completeRound(run);
          statusChanged = followTimer(roomId, previous, step, endedAt) || statusChanged;
          previous = step;
        }
        const at = now();
        run = mergeFocusCredits(run, drainFocus(roomId, at), at);
        const isDone = previous.phase === 'done';
        const outcome: Outcome = {
          timer: previous,
          run: isDone ? emptyRun() : run,
          ended: isDone && isRunActive(run) ? run : null,
          statusChanged,
        };
        const logged = await settle(roomId, outcome, endedAt);
        publish(io, roomId, outcome, logged);
      });
    } catch (err) {
      logger.error({ err, roomId }, 'failed to advance a room timer');
    }
  }

  async function memberLeaving(roomId: string, userId: string, at: Date): Promise<void> {
    await withRoom(roomId, async () => {
      const room = await loadTimerRoom(roomId);
      const credits = drainFocus(roomId, at, userId);
      if (room.closedAt || (!isRunActive(room.run) && credits.length === 0)) return;
      const run = withSessionId(mergeFocusCredits(room.run, credits, at));
      await saveRun(roomId, run);
      await savePartialSession(roomId, run, userId);
    });
  }

  async function finalizeOnClose(roomId: string, endedAt: Date): Promise<void> {
    await withRoom(roomId, async () => {
      const room = await loadTimerRoom(roomId);
      const run = mergeFocusCredits(room.run, drainFocus(roomId, endedAt), endedAt);
      if (!isRunActive(run)) return;
      await finalizeSession(roomId, run, endedAt);
      await saveRun(roomId, emptyRun());
    });
  }

  async function restore(io: TypedServer): Promise<void> {
    for (const { roomId, endsAt } of await findRunningTimers()) schedule(io, roomId, endsAt);
  }

  function dispose(): void {
    for (const timeout of timeouts.values()) clearTimeout(timeout);
    timeouts.clear();
  }

  return { command, memberLeaving, finalizeOnClose, restore, dispose };
}
