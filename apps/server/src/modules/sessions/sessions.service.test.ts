import { describe, expect, it } from 'vitest';
import { createUserWithToken } from '../../test/authHelpers';
import { useTestDatabase } from '../../test/testDb';
import { Room } from '../rooms/room.model';
import { createRoom } from '../rooms/rooms.service';
import { newRun, type TimerRun } from '../rooms/roomTimer.service';
import { User } from '../users/user.model';
import { Session } from './session.model';
import { finalizeSession, savePartialSession } from './sessions.service';

useTestDatabase();

const MIN = 60_000;
const START = new Date('2026-03-10T09:00:00Z');
const minutesIn = (minutes: number) => new Date(START.getTime() + minutes * MIN);

async function openRoom(hostId: string) {
  return createRoom(hostId, {
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    isPublic: true,
    maxSize: 10,
    goals: ['Read chapter 4', 'Problem set 2', 'Flashcards'],
    timerSettings: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
      autoStart: true,
    },
  });
}

function runWith(focus: [userId: string, minutes: number, lastAtMin?: number][], rounds = 0): TimerRun {
  return {
    ...newRun(START),
    roundsCompleted: rounds,
    focus: focus.map(([userId, minutes, lastAtMin = minutes]) => ({
      userId,
      focusedMs: minutes * MIN,
      firstFocusAt: START,
      lastFocusAt: minutesIn(lastAtMin),
    })),
  };
}

const participantsOf = async (sessionId: string) =>
  ((await Session.findById(sessionId).lean())?.participants ?? []).map(({ userId, focusedMins }) => ({
    userId: userId.toString(),
    focusedMins,
  }));

describe('savePartialSession', () => {
  it('saves the run so far, still in progress, and records the leaver’s study day', async () => {
    const [{ user: maya }, { user: jordan }] = await Promise.all([
      createUserWithToken(),
      createUserWithToken(),
    ]);
    const room = await openRoom(maya.id);
    const run = runWith([
      [maya.id, 25],
      [jordan.id, 12],
    ]);

    await savePartialSession(room.id, run, jordan.id);

    const session = (await Session.findById(run.sessionId).lean())!;
    expect(session).toMatchObject({
      roomName: 'Finals week focus',
      startedAt: START,
      endedAt: null,
      goalsDone: 0,
      goalsTotal: 3,
    });
    expect(await participantsOf(run.sessionId!)).toEqual([
      { userId: maya.id, focusedMins: 25 },
      { userId: jordan.id, focusedMins: 12 },
    ]);
    // Only the leaver's streak moves now; everyone else's waits for the end of the run.
    expect((await User.findById(jordan.id).lean())!).toMatchObject({
      streak: { current: 1, longest: 1 },
      lastStudiedAt: minutesIn(12),
    });
    expect((await User.findById(maya.id).lean())!.lastStudiedAt).toBeNull();
    // Not a finished session yet.
    expect((await Room.findById(room.id).lean())!).toMatchObject({ totalSessions: 0, totalFocusMins: 0 });
  });

  it('writes nothing for someone with less than a minute', async () => {
    const { user } = await createUserWithToken();
    const room = await openRoom(user.id);
    const run = {
      ...runWith([]),
      focus: [{ userId: user.id, focusedMs: 59_000, firstFocusAt: START, lastFocusAt: START }],
    };
    await savePartialSession(room.id, run, user.id);
    expect(await Session.countDocuments()).toBe(0);
    expect((await User.findById(user.id).lean())!.lastStudiedAt).toBeNull();
  });
});

describe('finalizeSession', () => {
  it('completes the same document a partial save started, adds to the room totals and updates streaks', async () => {
    const [{ user: maya }, { user: jordan }] = await Promise.all([
      createUserWithToken(),
      createUserWithToken(),
    ]);
    const room = await openRoom(maya.id);
    await Room.updateOne({ _id: room.id }, { $set: { 'goals.0.done': true, 'goals.2.done': true } });
    const partial = runWith([[jordan.id, 12]]);
    await savePartialSession(room.id, partial, jordan.id);

    const run = {
      ...runWith(
        [
          [maya.id, 100],
          [jordan.id, 12],
        ],
        4,
      ),
      sessionId: partial.sessionId,
    };
    const logged = await finalizeSession(room.id, run, minutesIn(115));

    expect(logged).toEqual({
      session: { id: run.sessionId, roundsCompleted: 4, goalsDone: 2, participants: 2 },
      totalSessions: 1,
      totalFocusMins: 112,
    });
    expect(await Session.countDocuments()).toBe(1);
    expect((await Session.findById(run.sessionId).lean())!).toMatchObject({
      startedAt: START,
      endedAt: minutesIn(115),
      goalsDone: 2,
      goalsTotal: 3,
      roundsCompleted: 4,
    });
    expect(await participantsOf(run.sessionId!)).toEqual([
      { userId: maya.id, focusedMins: 100 },
      { userId: jordan.id, focusedMins: 12 },
    ]);
    // Recording Jordan's day again changes nothing.
    for (const user of [maya, jordan]) {
      expect((await User.findById(user.id).lean())!.streak).toEqual({ current: 1, longest: 1 });
    }
  });

  it('adds up across sessions in the room', async () => {
    const { user } = await createUserWithToken();
    const room = await openRoom(user.id);
    await finalizeSession(room.id, runWith([[user.id, 25]], 1), minutesIn(25));
    const second = await finalizeSession(room.id, runWith([[user.id, 50]], 2), minutesIn(55));
    expect(second).toMatchObject({ totalSessions: 2, totalFocusMins: 75 });
  });

  it('extends a streak from yesterday in the user’s own time zone', async () => {
    // 23:30 on 9 March in Los Angeles is 06:30 UTC on 10 March, the same UTC day as the session.
    const { user } = await createUserWithToken({
      timeZone: 'America/Los_Angeles',
      streak: { current: 4, longest: 4 },
      lastStudiedAt: new Date('2026-03-10T06:30:00Z'),
    });
    const room = await openRoom(user.id);
    // The run ends at 09:25 UTC, which is 02:25 on 10 March in Los Angeles: the next local day.
    await finalizeSession(room.id, runWith([[user.id, 25]]), minutesIn(25));
    expect((await User.findById(user.id).lean())!.streak).toEqual({ current: 5, longest: 5 });
  });

  it('logs nothing for a run where nobody focused for a minute, and removes its in-progress document', async () => {
    const { user } = await createUserWithToken();
    const room = await openRoom(user.id);
    const run = runWith([]);
    await Session.create({ _id: run.sessionId!, roomId: room.id, roomName: 'x', startedAt: START });

    expect(await finalizeSession(room.id, run, minutesIn(1))).toBeNull();
    expect(await Session.countDocuments()).toBe(0);
    expect((await Room.findById(room.id).lean())!).toMatchObject({ totalSessions: 0, totalFocusMins: 0 });
  });

  it('gives an older run without a session id one', async () => {
    const { user } = await createUserWithToken();
    const room = await openRoom(user.id);
    const logged = await finalizeSession(
      room.id,
      { ...runWith([[user.id, 25]]), sessionId: null },
      minutesIn(25),
    );
    expect(logged?.session.id).toMatch(/^[a-f0-9]{24}$/);
    expect(await Session.countDocuments()).toBe(1);
  });
});
