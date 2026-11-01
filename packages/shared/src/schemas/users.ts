import { z } from 'zod';
import {
  AVATAR_COLORS,
  MAX_SUBJECTS,
  STUDYING_MAX,
  SUBJECT_MAX,
  TIMER_LIMITS,
  WEEKLY_GOAL_MAX_MINS,
  WEEKLY_GOAL_MIN_MINS,
} from '../constants';

type TimerField = keyof typeof TIMER_LIMITS;

function timerField(field: TimerField, label: string) {
  const { min, max } = TIMER_LIMITS[field];
  return z
    .number()
    .int()
    .min(min, `${label} must be between ${min} and ${max}.`)
    .max(max, `${label} must be between ${min} and ${max}.`);
}

export const timerDefaultsSchema = z.strictObject({
  focusMins: timerField('focusMins', 'Focus'),
  shortBreakMins: timerField('shortBreakMins', 'Short break'),
  longBreakMins: timerField('longBreakMins', 'Long break'),
  roundsBeforeLong: timerField('roundsBeforeLong', 'Long break every'),
  totalRounds: timerField('totalRounds', 'Rounds'),
});

const subjectsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Subjects can’t be empty.')
      .max(SUBJECT_MAX, `Subjects can be at most ${SUBJECT_MAX} characters.`),
  )
  .max(MAX_SUBJECTS, `Pick at most ${MAX_SUBJECTS} subjects.`)
  .transform((subjects) => [...new Set(subjects)]);

/**
 * PATCH /api/users/me. Every field is optional, but the body can't be empty. Strict, so fields that need
 * their own flow (email, username, password) can't be changed through it.
 */
export const updateMeSchema = z
  .strictObject({
    avatarColor: z.enum(AVATAR_COLORS, 'Pick one of the avatar colours.'),
    studying: z.string().trim().max(STUDYING_MAX, `Keep it to ${STUDYING_MAX} characters.`),
    subjects: subjectsSchema,
    weeklyGoalMins: z
      .number()
      .int()
      .min(WEEKLY_GOAL_MIN_MINS, 'Set a weekly goal of at least 1 hour.')
      .max(WEEKLY_GOAL_MAX_MINS, `Weekly goals can be at most ${WEEKLY_GOAL_MAX_MINS / 60} hours.`),
    timerDefaults: timerDefaultsSchema.partial(),
    /** Finishes (or skips) onboarding. The server sets onboardedAt the first time only. */
    onboarded: z.literal(true),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');

export const userIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'That user id is not valid.'),
});

export type UpdateMeInput = z.input<typeof updateMeSchema>;
export type UpdateMeData = z.output<typeof updateMeSchema>;
export type UserIdParams = z.output<typeof userIdParamsSchema>;
