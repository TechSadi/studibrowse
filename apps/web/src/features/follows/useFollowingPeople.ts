import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../lib/api';

/**
 * The people you follow (names and avatar colours). The ids are in the key, so following or unfollowing someone
 * refetches; the sidebar and Home's hero share the one request.
 */
export function useFollowingPeople(following: string[]) {
  return useQuery({
    queryKey: ['following', following],
    queryFn: () => usersApi.myFollowing(),
    enabled: following.length > 0,
  });
}
