import type { RequestHandler } from 'express';
import type { UsernameAvailabilityResponse } from '@studibrowse/shared';
import * as usersService from './users.service';

export const usernameAvailable: RequestHandler<
  Record<string, string>,
  UsernameAvailabilityResponse,
  unknown,
  { u: string }
> = async (req, res) => {
  res.json({ available: await usersService.isUsernameAvailable(req.query.u) });
};
