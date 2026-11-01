import { z } from 'zod';
import { SESSION_HISTORY_PAGE_SIZE } from '../constants';
import { objectIdSchema } from './rooms';

/**
 * GET /api/sessions/mine/latest. `since` (epoch ms, server clock) leaves out sessions last saved before it, so
 * a run from an earlier visit isn't shown as this one. Query values arrive as strings.
 */
export const latestSessionQuerySchema = z.object({
  roomId: objectIdSchema('That room id is not valid.'),
  since: z.coerce.number().int().nonnegative('That time is not valid.').optional(),
});

export type LatestSessionQuery = z.output<typeof latestSessionQuerySchema>;

/**
 * GET /api/sessions/mine. `cursor` is the opaque `nextCursor` of the page before; without it you get the first
 * page, which starts with any sessions still in progress.
 */
export const mySessionsQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'That page size is not valid.')
    .max(SESSION_HISTORY_PAGE_SIZE, 'That page size is not valid.')
    .default(SESSION_HISTORY_PAGE_SIZE),
});

export type MySessionsQuery = z.output<typeof mySessionsQuerySchema>;
