import type { RequestHandler } from 'express';
import type { ProgressSummaryQuery, ProgressSummaryResponse } from '@studibrowse/shared';
import * as progressService from './progress.service';

// requireAuth runs before every handler, so userId is set.

export const summary: RequestHandler<Record<string, string>, ProgressSummaryResponse> = async (req, res) => {
  // validateQuery replaced req.query with the parsed value, which Express's string-only query type can't describe.
  const { range } = req.query as unknown as ProgressSummaryQuery;
  res.json(await progressService.getProgressSummary(req.userId!, range));
};
