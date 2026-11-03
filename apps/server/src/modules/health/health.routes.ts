import { Router } from 'express';
import type { HealthResponse } from '@studibrowse/shared';

export interface HealthChecks {
  isDatabaseConnected: () => boolean;
  /** True from SIGTERM until exit, so the platform stops sending traffic to an instance that's closing. */
  isShuttingDown: () => boolean;
  /** The deployed commit, so the deploy workflow can tell the new instance from the old one. */
  release?: string;
}

/**
 * Render's health check. 200 only when this instance can serve requests: the database is reachable and the
 * server isn't shutting down. A 503 keeps a new deploy from going live without its database, and takes a
 * draining instance out of rotation.
 */
export function createHealthRouter({ isDatabaseConnected, isShuttingDown, release }: HealthChecks): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const db = isDatabaseConnected() ? 'up' : 'down';
    const ok = db === 'up' && !isShuttingDown();
    const body: HealthResponse = { ok, db, ...(release && { release }) };
    res.status(ok ? 200 : 503).json(body);
  });
  return router;
}
