import { Types } from 'mongoose';
import type { TimerPhase, TimerSettings } from '@studibrowse/shared';
import type { TimerState } from '../../realtime/timer';
import { Room } from './room.model';
import { roomNotFound } from './rooms.errors';

/** Focus time credited to one member during the current run. */
export interface RunFocus {
  userId: string;
  focusedMs: number;
  firstFocusAt: Date;
  lastFocusAt: Date;
}

/**
 * The current run (start → done or reset), for its session log. `startedAt` is null between runs.
 * See docs/ARCHITECTURE.md › Sessions.
 */
export interface TimerRun {
  sessionId: string | null;
  startedAt: Date | null;
  focus: RunFocus[];
  roundsCompleted: number;
}

export interface FocusCredit {
  userId: string;
  focusedMs: number;
}

export function emptyRun(): TimerRun {
  return { sessionId: null, startedAt: null, focus: [], roundsCompleted: 0 };
}

/** A fresh run, started by timer:start from idle or done. */
export function newRun(startedAt: Date): TimerRun {
  return { sessionId: new Types.ObjectId().toString(), startedAt, focus: [], roundsCompleted: 0 };
}

/** Whether there is a run to log: one was started, or focus was credited without one (an older room). */
export function isRunActive(run: TimerRun): boolean {
  return run.startedAt !== null || run.focus.length > 0;
}

export interface TimerRoom {
  timer: TimerState;
  timerSettings: TimerSettings;
  run: TimerRun;
  closedAt: Date | null;
}

interface TimerRoomRecord {
  timer: { phase: string; round: number; endsAt: Date | null; pausedRemaining: number | null };
  timerSettings: TimerSettings;
  run?: {
    sessionId?: Types.ObjectId | null;
    startedAt: Date | null;
    focus: { userId: Types.ObjectId; focusedMs: number; firstFocusAt?: Date; lastFocusAt?: Date }[];
    roundsCompleted?: number;
  };
  closedAt: Date | null;
}

export async function loadTimerRoom(roomId: string): Promise<TimerRoom> {
  const room = await Room.findById(roomId, {
    timer: 1,
    timerSettings: 1,
    run: 1,
    closedAt: 1,
  }).lean<TimerRoomRecord>();
  if (!room) throw roomNotFound();
  return {
    timer: {
      phase: room.timer.phase as TimerPhase,
      round: room.timer.round,
      endsAt: room.timer.endsAt ?? null,
      pausedRemaining: room.timer.pausedRemaining ?? null,
    },
    timerSettings: room.timerSettings,
    run: toTimerRun(room.run),
    closedAt: room.closedAt,
  };
}

function toTimerRun(run: TimerRoomRecord['run']): TimerRun {
  if (!run) return emptyRun();
  const fallback = run.startedAt ?? new Date();
  return {
    sessionId: run.sessionId?.toString() ?? null,
    startedAt: run.startedAt ?? null,
    focus: run.focus.map(({ userId, focusedMs, firstFocusAt, lastFocusAt }) => ({
      userId: userId.toString(),
      focusedMs,
      firstFocusAt: firstFocusAt ?? fallback,
      lastFocusAt: lastFocusAt ?? fallback,
    })),
    roundsCompleted: run.roundsCompleted ?? 0,
  };
}

export async function saveTimer(roomId: string, timer: TimerState, run: TimerRun): Promise<void> {
  await Room.updateOne({ _id: roomId }, { timer, run });
}

/** Saves only the run, when the timer itself didn't change (someone left, or the room closed). */
export async function saveRun(roomId: string, run: TimerRun): Promise<void> {
  await Room.updateOne({ _id: roomId }, { run });
}

/** Gives a run credited before session ids existed one, so its partial saves share a document. */
export function withSessionId(run: TimerRun): TimerRun & { sessionId: string } {
  return { ...run, sessionId: run.sessionId ?? new Types.ObjectId().toString() };
}

/** Open rooms whose timer is running, to reschedule them after a restart. */
export async function findRunningTimers(): Promise<{ roomId: string; endsAt: Date }[]> {
  const rooms = await Room.find(
    { closedAt: null, 'timer.endsAt': { $ne: null } },
    { 'timer.endsAt': 1 },
  ).lean<{ _id: Types.ObjectId; timer: { endsAt: Date } }[]>();
  return rooms.map((room) => ({ roomId: room._id.toString(), endsAt: room.timer.endsAt }));
}

/** Adds each credit, drained at `at`, to that member's total in the run. Pure. */
export function mergeFocusCredits(run: TimerRun, credits: FocusCredit[], at: Date): TimerRun {
  const totals = new Map(run.focus.map((entry) => [entry.userId, entry]));
  for (const { userId, focusedMs } of credits) {
    const entry = totals.get(userId);
    totals.set(
      userId,
      entry
        ? { ...entry, focusedMs: entry.focusedMs + focusedMs, lastFocusAt: at }
        : { userId, focusedMs, firstFocusAt: at, lastFocusAt: at },
    );
  }
  return { ...run, focus: [...totals.values()] };
}
