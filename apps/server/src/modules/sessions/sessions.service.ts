import type { LatestSessionResponse, MySession, SessionSummary } from '@studibrowse/shared';
import { createKeyedLock } from '../../lib/keyedLock';
import { unauthenticated } from '../auth/auth.errors';
import { Room } from '../rooms/room.model';
import { roomNotFound } from '../rooms/rooms.errors';
import { withSessionId, type RunFocus, type TimerRun } from '../rooms/roomTimer.service';
import { User } from '../users/user.model';
import { toParticipants, totalFocusMins } from './focusAccounting';
import { Session, type SessionRecord } from './session.model';
import { nextStreak } from './streak';
import { isThisWeek, studiedToday } from './week';

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
    goalsTotal: room.goals.length,
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

// A week back from now, plus a day for time zones: everything that can fall in this Sunday-to-Saturday week.
const WEEK_LOOKBACK_MS = 8 * 86_400_000;

function myMinutes(session: Pick<SessionRecord, 'participants'>, userId: string): number {
  return session.participants.find((p) => p.userId.toString() === userId)?.focusedMins ?? 0;
}

function toMySession(session: SessionRecord, userId: string): MySession {
  return {
    id: session._id.toString(),
    roomName: session.roomName,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    focusedMins: myMinutes(session, userId),
    roundsCompleted: session.roundsCompleted,
    goalsDone: session.goalsDone,
    goalsTotal: session.goalsTotal,
  };
}

/**
 * The session summary after leaving a room: your latest session there (last saved at or after `since`, if
 * given), whether the room is still open, this week's focus against your goal, and your streak if it's alive
 * today. Any room id: the answer only holds your own sessions and whether the room is open.
 */
export async function getLatestSession(
  userId: string,
  roomId: string,
  since: Date | undefined,
  now = new Date(),
): Promise<LatestSessionResponse> {
  const [room, user] = await Promise.all([
    Room.findById(roomId, { closedAt: 1 }).lean(),
    User.findById(userId, { weeklyGoalMins: 1, timeZone: 1, streak: 1, lastStudiedAt: 1 }).lean(),
  ]);
  if (!room) throw roomNotFound();
  if (!user) throw unauthenticated();

  const [latest, recent] = await Promise.all([
    Session.findOne({
      roomId,
      'participants.userId': userId,
      ...(since ? { updatedAt: { $gte: since } } : {}),
    })
      .sort({ startedAt: -1 })
      .lean<SessionRecord>(),
    Session.find(
      { 'participants.userId': userId, startedAt: { $gte: new Date(now.getTime() - WEEK_LOOKBACK_MS) } },
      { startedAt: 1, participants: 1 },
    ).lean<Pick<SessionRecord, 'startedAt' | 'participants'>[]>(),
  ]);

  const weekMins = recent
    .filter((session) => isThisWeek(session.startedAt, now, user.timeZone))
    .reduce((sum, session) => sum + myMinutes(session, userId), 0);

  return {
    session: latest ? toMySession(latest, userId) : null,
    roomOpen: room.closedAt === null,
    week: { focusMins: weekMins, goalMins: user.weeklyGoalMins },
    streakDays: studiedToday(user.lastStudiedAt ?? null, now, user.timeZone) ? user.streak.current : 0,
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
