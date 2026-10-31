import { Router } from 'express';
import { usernameAvailabilityQuerySchema } from '@studibrowse/shared';
import { validateQuery } from '../../middleware/validate';
import * as controller from './users.controller';

export function createUsersRouter(): Router {
  const router = Router();
  // Public: the Sign up form checks the username as you type.
  router.get(
    '/username-available',
    validateQuery(usernameAvailabilityQuerySchema),
    controller.usernameAvailable,
  );
  return router;
}
