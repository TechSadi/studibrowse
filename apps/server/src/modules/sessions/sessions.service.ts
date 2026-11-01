import type { SessionSummary } from '@studibrowse/shared';
import { createKeyedLock } from '../../lib/keyedLock';
import { Room } from '../rooms/room.model';
import { withSessionId, type RunFocus, type TimerRun } from '../rooms/roomTimer.service';
import { User } from '../users/user.model';
import { toParticipants, totalFocusMins } from './focusAccounting';
import { Session } from './session.model';
import { nextStreak } from './streak';

/** What session:logged tells the room. */
export interface LoggedSession {
  session: SessionSummary;
  totalSessions: number;
  totalFocusMins: number;
}

// Two rooms logging for the same person must not interleave their streak read → write.
const withUser = createKeyedLock();

interface SessionRoom {
  name: string;
  goals: { done: boolean }[];
}

async function loadSessionRoom(roomId: string): Promise<SessionRoom | null> {
  return Room.findById(roomId, { name: 1, goals: 1 }).lean<SessionRoom>();
}

/** The session document as the run stands now. `endedAt` is set only by finalizeSession. */
async function writeSession(roomId: string, room: SessionRoom, run: TimerRun, endedAt: Date | null) {
  const participants = toParticipants(run.focus);
  const fields = {
    roomId,
    roomName: room.name,
    startedAt: run.startedAt ?? run.focus[0]?.firstFocusAt ?? endedAt ?? new Date(),
    participants,
    goalsDone: room.goals.filter((goal) => goal.done).length,
    roundsCompleted: run.roundsCompleted,
  };
  await Session.updateOne(
    { _id: run.sessionId },
    endedAt ? { $set: { ...fields, endedAt } } : { $set: fields, $setOnInsert: { endedAt: null } },
    { upsert: true },
  );
  return participants;
}

/**
 * Someone left mid-run: saves the run's session as it stands (still in progress), and records their study
 * day, so their focus time is never lost. Needs `run.sessionId`. Does nothing until they have a minute.
 */
export async function savePartialSession(roomId: string, run: TimerRun, userId: string): Promise<void> {
  const focus = run.focus.find((entry) => entry.userId === userId);
  if (!run.sessionId || !focus || toParticipants([focus]).length === 0) return;
  const room = await loadSessionRoom(roomId);
  if (!room) return;
  await writeSession(roomId, room, run, null);
  await recordStudy(focus);
}

/**
 * The run ended (done, reset, or the room closed). Saves its session, adds it to the room's totals and records
 * everyone's study day. A run where nobody focused for a minute isn't logged: returns null and removes any
 * in-progress document (a partial save can't exist without a minute, but this keeps it tidy).
 */
export async function finalizeSession(
  roomId: string,
  ended: TimerRun,
  endedAt: Date,
): Promise<LoggedSession | null> {
  const run = withSessionId(ended);
  const room = await loadSessionRoom(roomId);
  if (!room || toParticipants(run.focus).length === 0) {
    if (run.sessionId) await Session.deleteOne({ _id: run.sessionId });
    return null;
  }
  const participants = await writeSession(roomId, room, run, endedAt);
  const totals = await Room.findByIdAndUpdate(
    roomId,
    { $inc: { totalSessions: 1, totalFocusMins: totalFocusMins(participants) } },
    { returnDocument: 'after', projection: { totalSessions: 1, totalFocusMins: 1 } },
  ).lean();
  const credited = new Set(participants.map((participant) => participant.userId));
  for (const focus of run.focus) if (credited.has(focus.userId)) await recordStudy(focus);

  return {
    session: {
      id: run.sessionId,
      roundsCompleted: run.roundsCompleted,
      goalsDone: room.goals.filter((goal) => goal.done).length,
      participants: participants.length,
    },
    totalSessions: totals?.totalSessions ?? 0,
    totalFocusMins: totals?.totalFocusMins ?? 0,
  };
}

/**
 * Updates someone's streak and lastStudiedAt for the days they focused in a run: the first and the last
 * credit, so a run across midnight counts both days. Repeating it is harmless (see nextStreak).
 */
export async function recordStudy({ userId, firstFocusAt, lastFocusAt }: RunFocus): Promise<void> {
  await withUser(userId, async () => {
    const user = await User.findById(userId, { streak: 1, lastStudiedAt: 1, timeZone: 1 });
    if (!user) return;
    let state = {
      current: user.streak.current,
      longest: user.streak.longest,
      lastStudiedAt: user.lastStudiedAt ?? null,
    };
    for (const studiedAt of [firstFocusAt, lastFocusAt]) state = nextStreak(state, studiedAt, user.timeZone);
    await User.updateOne(
      { _id: userId },
      {
        streak: { current: state.current, longest: state.longest },
        lastStudiedAt: state.lastStudiedAt,
      },
    );
  });
}
