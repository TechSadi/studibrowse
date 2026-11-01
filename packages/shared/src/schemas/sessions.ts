import { z } from 'zod';
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
