import { z } from 'zod';
import { PROGRESS_RANGES } from '../constants';

/** GET /api/progress/summary. Only `week` for now. */
export const progressSummaryQuerySchema = z.object({
  range: z.enum(PROGRESS_RANGES, 'That range is not valid.').default('week'),
});

export type ProgressSummaryQuery = z.output<typeof progressSummaryQuerySchema>;
