import { z } from 'zod';
import {
  GOAL_TEXT_MAX,
  INVITE_CODE_PATTERN,
  MAX_GOALS,
  MAX_ROOM_SIZE,
  MIN_ROOM_SIZE,
  ROOM_DESCRIPTION_MAX,
  ROOM_FILTERS,
  ROOM_NAME_MAX,
  ROOM_SUBJECT_MAX,
} from '../constants';
import { timerDefaultsSchema } from './users';

export const timerSettingsSchema = timerDefaultsSchema.extend({
  autoStart: z.boolean(),
});

export const goalTextSchema = z
  .string()
  .trim()
  .min(1, 'Goals can’t be empty.')
  .max(GOAL_TEXT_MAX, `Keep each goal to ${GOAL_TEXT_MAX} characters.`);

/**
 * POST /api/rooms, and the host's Room settings dialog (roomSettingsSchema, sent as room:settings).
 * Strict, so the host, invite code and timer state can't be set from the client.
 */
export const createRoomSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Give your room a name so people know what they’re joining.')
    .max(ROOM_NAME_MAX, `Keep the name to ${ROOM_NAME_MAX} characters.`),
  subject: z
    .string()
    .trim()
    .max(ROOM_SUBJECT_MAX, `Keep the subject to ${ROOM_SUBJECT_MAX} characters.`)
    .default(''),
  description: z
    .string()
    .trim()
    .max(ROOM_DESCRIPTION_MAX, `Keep the description to ${ROOM_DESCRIPTION_MAX} characters.`)
    .default(''),
  isPublic: z.boolean(),
  maxSize: z
    .number()
    .int()
    .min(MIN_ROOM_SIZE, `Rooms hold between ${MIN_ROOM_SIZE} and ${MAX_ROOM_SIZE} people.`)
    .max(MAX_ROOM_SIZE, `Rooms hold between ${MIN_ROOM_SIZE} and ${MAX_ROOM_SIZE} people.`),
  goals: z.array(goalTextSchema).max(MAX_GOALS, `Rooms can have at most ${MAX_GOALS} goals.`).default([]),
  timerSettings: timerSettingsSchema,
});

export const roomSettingsSchema = createRoomSchema;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/** GET /api/rooms/public. Query values arrive as strings. */
export const publicRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Pages start at 1.').default(1),
  subject: optionalText(ROOM_SUBJECT_MAX),
  q: optionalText(ROOM_NAME_MAX),
  filter: z.enum(ROOM_FILTERS, 'That filter is not valid.').default('all'),
});

/** A MongoDB ObjectId as a 24-character hex string. */
export const objectIdSchema = (message: string) => z.string().regex(/^[a-f0-9]{24}$/i, message);

export const roomIdParamsSchema = z.object({
  id: objectIdSchema('That room id is not valid.'),
});

export const inviteCodeParamsSchema = z.object({
  code: z.string().regex(INVITE_CODE_PATTERN, 'That invite code is not valid.'),
});

export type TimerSettingsInput = z.input<typeof timerSettingsSchema>;
export type CreateRoomInput = z.input<typeof createRoomSchema>;
export type CreateRoomData = z.output<typeof createRoomSchema>;
export type PublicRoomsQuery = z.output<typeof publicRoomsQuerySchema>;
export type RoomIdParams = z.output<typeof roomIdParamsSchema>;
export type InviteCodeParams = z.output<typeof inviteCodeParamsSchema>;
