import type { Types } from 'mongoose';
import type { TimerPhase, TimerSettings } from '@studibrowse/shared';
import type { TimerState } from '../../realtime/timer';
import { Room } from './room.model';
import { roomNotFound } from './rooms.errors';

/** Focus time credited to each member during the current run, for the session log (Phase 3). */
export interface TimerRun {
  startedAt: Date | null;
  focus: { userId: string; focusedMs: number }[];
}

export interface FocusCredit {
  userId: string;
  focusedMs: number;
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
  run?: { startedAt: Date | null; focus: { userId: Types.ObjectId; focusedMs: number }[] };
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
    run: {
      startedAt: room.run?.startedAt ?? null,
      focus: (room.run?.focus ?? []).map(({ userId, focusedMs }) => ({
        userId: userId.toString(),
        focusedMs,
      })),
    },
    closedAt: room.closedAt,
  };
}

export async function saveTimer(roomId: string, timer: TimerState, run: TimerRun): Promise<void> {
  await Room.updateOne({ _id: roomId }, { timer, run });
}

/** Open rooms whose timer is running, to reschedule them after a restart. */
export async function findRunningTimers(): Promise<{ roomId: string; endsAt: Date }[]> {
  const rooms = await Room.find(
    { closedAt: null, 'timer.endsAt': { $ne: null } },
    { 'timer.endsAt': 1 },
  ).lean<{ _id: Types.ObjectId; timer: { endsAt: Date } }[]>();
  return rooms.map((room) => ({ roomId: room._id.toString(), endsAt: room.timer.endsAt }));
}

/** Adds each credit to that member's total in the run. Pure. */
export function mergeFocusCredits(run: TimerRun, credits: FocusCredit[]): TimerRun {
  const totals = new Map(run.focus.map(({ userId, focusedMs }) => [userId, focusedMs]));
  for (const { userId, focusedMs } of credits) totals.set(userId, (totals.get(userId) ?? 0) + focusedMs);
  return { ...run, focus: [...totals].map(([userId, focusedMs]) => ({ userId, focusedMs })) };
}
