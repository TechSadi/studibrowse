import type { RequestHandler } from 'express';
import type { LatestSessionQuery, LatestSessionResponse } from '@studibrowse/shared';
import * as sessionsService from './sessions.service';

// requireAuth runs before every handler, so userId is set.

export const latestMine: RequestHandler<Record<string, string>, LatestSessionResponse> = async (req, res) => {
  // validateQuery replaced req.query with the parsed value, which Express's string-only query type can't describe.
  const { roomId, since } = req.query as unknown as LatestSessionQuery;
  res.json(
    await sessionsService.getLatestSession(
      req.userId!,
      roomId,
      since === undefined ? undefined : new Date(since),
    ),
  );
};
