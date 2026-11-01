import { Router } from 'express';
import {
  createRoomSchema,
  inviteCodeParamsSchema,
  publicRoomsQuerySchema,
  roomIdParamsSchema,
  uploadSignSchema,
} from '@studibrowse/shared';
import type { StorageService } from '../../lib/storage';
import { createAuthRateLimiter, INVITE_RATE_LIMIT, UPLOAD_SIGN_RATE_LIMIT } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/requireAuth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { createUploadsController } from '../resources/uploads.controller';
import { createRoomsController } from './rooms.controller';

export function createRoomsRouter({
  storage,
  onRoomCreated,
}: {
  storage: StorageService;
  onRoomCreated?: (roomId: string) => void;
}): Router {
  const router = Router();
  const controller = createRoomsController({ onRoomCreated });
  const uploads = createUploadsController(storage);
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
  // Members only (checked in the service). Counted per person, after requireAuth has set userId.
  router.post(
    '/:id/uploads/sign',
    requireAuth,
    createAuthRateLimiter({ ...UPLOAD_SIGN_RATE_LIMIT, keyGenerator: (req) => `user:${req.userId}` }),
    validateParams(roomIdParamsSchema),
    validateBody(uploadSignSchema),
    uploads.sign,
  );
  return router;
}
