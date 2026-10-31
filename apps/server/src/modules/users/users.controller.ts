import type { RequestHandler } from 'express';
import type {
  MeResponse,
  SuggestionsResponse,
  UpdateMeData,
  UserIdParams,
  UsernameAvailabilityResponse,
} from '@studibrowse/shared';
import * as usersService from './users.service';

export const usernameAvailable: RequestHandler<
  Record<string, string>,
  UsernameAvailabilityResponse,
  unknown,
  { u: string }
> = async (req, res) => {
  res.json({ available: await usersService.isUsernameAvailable(req.query.u) });
};

// requireAuth runs before every handler below, so userId is set.

export const updateMe: RequestHandler<Record<string, string>, MeResponse, UpdateMeData> = async (
  req,
  res,
) => {
  res.json({ user: await usersService.updateMe(req.userId!, req.body) });
};

export const suggestions: RequestHandler<Record<string, string>, SuggestionsResponse> = async (req, res) => {
  res.json({ users: await usersService.listSuggestions(req.userId!) });
};

export const follow: RequestHandler<UserIdParams, MeResponse> = async (req, res) => {
  res.json({ user: await usersService.follow(req.userId!, req.params.id) });
};

export const unfollow: RequestHandler<UserIdParams, MeResponse> = async (req, res) => {
  res.json({ user: await usersService.unfollow(req.userId!, req.params.id) });
};
