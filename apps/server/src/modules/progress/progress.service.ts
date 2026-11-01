import { Types } from 'mongoose';
import type { ProgressRange, ProgressSummaryResponse } from '@studibrowse/shared';
import { unauthenticated } from '../auth/auth.errors';
import { Session } from '../sessions/session.model';
import { localDayNumber, resolveTimeZone } from '../sessions/streak';
import { studiedToday, weekStartDay } from '../sessions/week';
import { User } from '../users/user.model';

const MS_PER_DAY = 86_400_000;

/** A day number (see localDayNumber) as "2026-11-01", the format $dateToString gives. */
function dayKey(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function weekFrom(start: number): string[] {
  return Array.from({ length: 7 }, (_, index) => dayKey(start + index));
}

interface WeekTotals {
  sessions: number;
  rooms: number;
  people: number;
}

interface SummaryFacets {
  byDay: { _id: string; focusMins: number }[];
  thisWeek: WeekTotals[];
}

/**
 * Your minutes per local day across last week and this week, and how many sessions, rooms and other people
 * this week had. Mongo works out each session's local day itself ($dateToString with the zone), so days
 * around a DST change need no maths here.
 */
async function weekFacets(
  userId: string,
  timeZone: string,
  thisWeek: string[],
  lastWeek: string[],
): Promise<SummaryFacets> {
  const me = new Types.ObjectId(userId);
  // Midnight UTC the day before last week's Sunday comes before that Sunday's midnight in every zone.
  const from = new Date(Date.parse(lastWeek[0]!) - MS_PER_DAY);
  const [facets] = await Session.aggregate<SummaryFacets>([
    { $match: { 'participants.userId': me, startedAt: { $gte: from } } },
    {
      $addFields: {
        day: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: timeZone } },
        mine: {
          $sum: {
            $map: {
              input: { $filter: { input: '$participants', cond: { $eq: ['$$this.userId', me] } } },
              in: '$$this.focusedMins',
            },
          },
        },
      },
    },
    { $match: { day: { $in: [...lastWeek, ...thisWeek] } } },
    {
      $facet: {
        byDay: [{ $group: { _id: '$day', focusMins: { $sum: '$mine' } } }],
        thisWeek: [
          { $match: { day: { $in: thisWeek } } },
          {
            $group: {
              _id: null,
              sessions: { $sum: 1 },
              rooms: { $addToSet: '$roomId' },
              people: { $push: '$participants.userId' },
            },
          },
          {
            $project: {
              _id: 0,
              sessions: 1,
              rooms: { $size: '$rooms' },
              people: {
                $size: {
                  $setDifference: [
                    {
                      $reduce: {
                        input: '$people',
                        initialValue: [],
                        in: { $setUnion: ['$$value', '$$this'] },
                      },
                    },
                    [me],
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ]);
  return facets ?? { byDay: [], thisWeek: [] };
}

/**
 * Progress for this week, Sunday to Saturday in your time zone: your minutes each day, against your goal and
 * last week, how many sessions, rooms and people, and your streak. A session counts toward the day it
 * started, and in-progress ones count, as on the session summary.
 */
export async function getProgressSummary(
  userId: string,
  range: ProgressRange,
  now = new Date(),
): Promise<ProgressSummaryResponse> {
  const user = await User.findById(userId, {
    weeklyGoalMins: 1,
    timeZone: 1,
    streak: 1,
    lastStudiedAt: 1,
  }).lean();
  if (!user) throw unauthenticated();

  const timeZone = resolveTimeZone(user.timeZone);
  const start = weekStartDay(now, timeZone);
  const thisWeek = weekFrom(start);
  const lastWeek = weekFrom(start - 7);
  const { byDay, thisWeek: totals } = await weekFacets(userId, timeZone, thisWeek, lastWeek);
  const minsOn = new Map(byDay.map(({ _id, focusMins }) => [_id, focusMins]));
  const sum = (dates: string[]) => dates.reduce((total, date) => total + (minsOn.get(date) ?? 0), 0);

  const today = localDayNumber(now, timeZone);
  const lastStudiedAt = user.lastStudiedAt ?? null;
  // Streaks only change when a session is logged, so one whose last day is before yesterday has lapsed.
  const alive = lastStudiedAt !== null && localDayNumber(lastStudiedAt, timeZone) >= today - 1;
  const week = totals[0] ?? { sessions: 0, rooms: 0, people: 0 };

  return {
    range,
    today: dayKey(today),
    days: thisWeek.map((date) => ({ date, focusMins: minsOn.get(date) ?? 0 })),
    week: { focusMins: sum(thisWeek), goalMins: user.weeklyGoalMins, ...week },
    lastWeek: { focusMins: sum(lastWeek) },
    streak: {
      current: alive ? user.streak.current : 0,
      longest: user.streak.longest,
      studiedToday: studiedToday(lastStudiedAt, now, timeZone),
    },
  };
}
