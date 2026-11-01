import { Router } from 'express';
import {
  createRoomSchema,
  inviteCodeParamsSchema,
  publicRoomsQuerySchema,
  roomIdParamsSchema,
} from '@studibrowse/shared';
import { createAuthRateLimiter, INVITE_RATE_LIMIT } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as controller from './rooms.controller';

export function createRoomsRouter(): Router {
  const router = Router();
  router.post('/', requireAuth, validateBody(createRoomSchema), controller.create);
  router.get('/public', requireAuth, validateQuery(publicRoomsQuerySchema), controller.listPublic);
  // Public: invite links are opened by people who may not have an account yet. Rate limited against guessing.
  router.get(
    '/invite/:code',
    createAuthRateLimiter(INVITE_RATE_LIMIT),
    validateParams(inviteCodeParamsSchema),
    controller.invitePreview,
  );
  router.get('/:id', requireAuth, validateParams(roomIdParamsSchema), controller.getById);
  return router;
}
