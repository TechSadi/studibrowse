import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, usersApi } from '../../lib/api';
import { PEOPLE_KEY } from '../follows/useFollowToggle';

export type FollowListKind = 'followers' | 'following';

export const profileKey = (username: string) => [...PEOPLE_KEY, 'profile', username] as const;
const followListKey = (username: string, kind: FollowListKind) => [...PEOPLE_KEY, kind, username] as const;

export function useProfile(username: string) {
  return useQuery({
    queryKey: profileKey(username),
    queryFn: () => usersApi.profile(username),
    // A 404 (no such person) won't change on a retry.
    retry: (failures, err) => !(err instanceof ApiError && err.status < 500) && failures < 3,
  });
}

/** A profile's Followers or Following list, a page at a time ("Show more"). */
export function useFollowList(username: string, kind: FollowListKind) {
  return useInfiniteQuery({
    queryKey: followListKey(username, kind),
    queryFn: ({ pageParam }) => usersApi.followList(username, kind, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
