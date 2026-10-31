import { Router } from 'express';
import type { HealthResponse } from '@studibrowse/shared';

export function createHealthRouter(isDatabaseConnected: () => boolean): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const body: HealthResponse = { ok: true, db: isDatabaseConnected() ? 'up' : 'down' };
    res.json(body);
  });
  return router;
}
