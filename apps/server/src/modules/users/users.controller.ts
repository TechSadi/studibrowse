import type { RequestHandler } from 'express';
import type {
  ChangeEmailData,
  DeleteAccountData,
  FollowingResponse,
  FollowListQuery,
  FollowListResponse,
  MeResponse,
  ProfileResponse,
  SuggestionsResponse,
  UpdateMeData,
  UserIdParams,
  UsernameAvailabilityResponse,
  UsernameParams,
} from '@studibrowse/shared';
import { clearRefreshCookie } from '../auth/auth.cookies';
import { deleteAccount } from './accountDeletion.service';
import * as profileService from './profile.service';
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

export const changeEmail: RequestHandler<Record<string, string>, MeResponse, ChangeEmailData> = async (
  req,
  res,
) => {
  res.json({ user: await usersService.changeEmail(req.userId!, req.body) });
};

/** `onDeleted` drops the person's open sockets, so they leave their rooms. */
export function createDeleteMeHandler(
  onDeleted?: (userId: string) => void,
): RequestHandler<Record<string, string>, unknown, DeleteAccountData> {
  return async (req, res) => {
    await deleteAccount(req.userId!, req.body);
    clearRefreshCookie(res);
    onDeleted?.(req.userId!);
    res.status(204).end();
  };
}

export const suggestions: RequestHandler<Record<string, string>, SuggestionsResponse> = async (req, res) => {
  res.json({ users: await usersService.listSuggestions(req.userId!) });
};

export const following: RequestHandler<Record<string, string>, FollowingResponse> = async (req, res) => {
  res.json({ users: await usersService.listFollowing(req.userId!) });
};

export const follow: RequestHandler<UserIdParams, MeResponse> = async (req, res) => {
  res.json({ user: await usersService.follow(req.userId!, req.params.id) });
};

export const unfollow: RequestHandler<UserIdParams, MeResponse> = async (req, res) => {
  res.json({ user: await usersService.unfollow(req.userId!, req.params.id) });
};

export const profile: RequestHandler<UsernameParams, ProfileResponse> = async (req, res) => {
  res.json({ profile: await profileService.getProfile(req.userId!, req.params.username) });
};

export const followers: RequestHandler<UsernameParams, FollowListResponse> = async (req, res) => {
  const query = req.query as unknown as FollowListQuery;
  res.json(await profileService.listFollowers(req.userId!, req.params.username, query));
};

export const followingOf: RequestHandler<UsernameParams, FollowListResponse> = async (req, res) => {
  const query = req.query as unknown as FollowListQuery;
  res.json(await profileService.listFollowingOf(req.userId!, req.params.username, query));
};
