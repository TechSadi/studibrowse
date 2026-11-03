import { z } from 'zod';
import { NOTIFICATION_FILTERS, NOTIFICATIONS_PAGE_SIZE } from '../constants';
import { objectIdSchema } from './rooms';

/**
 * GET /api/notifications. `cursor` is the opaque `nextCursor` of the page before; without it you get the newest
 * page. Query values arrive as strings.
 */
export const notificationsQuerySchema = z.object({
  filter: z.enum(NOTIFICATION_FILTERS, 'That filter is not valid.').default('all'),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'That page size is not valid.')
    .max(NOTIFICATIONS_PAGE_SIZE, 'That page size is not valid.')
    .default(NOTIFICATIONS_PAGE_SIZE),
});

export type NotificationsQuery = z.output<typeof notificationsQuerySchema>;

/** POST /api/notifications/read: one notification, or all of yours. */
export const markReadSchema = z.union([
  z.object({ id: objectIdSchema('That notification id is not valid.') }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export type MarkReadData = z.output<typeof markReadSchema>;
