import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/ui/Toast';
import { usersApi } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';

/** Profiles and their Followers / Following lists, which show follower counts and Follow buttons. */
export const PEOPLE_KEY = ['people'] as const;

interface FollowVariables {
  id: string;
  follow: boolean;
}

/**
 * Follows or unfollows someone. The returned user (with the new `following`) replaces the signed-in one, which
 * refreshes the sidebar; profiles and people lists load again for their new counts.
 */
export function useFollowToggle() {
  const { setUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: ({ id, follow }: FollowVariables) => (follow ? usersApi.follow(id) : usersApi.unfollow(id)),
    onSuccess: ({ user }, { follow }) => {
      setUser(user);
      void queryClient.invalidateQueries({ queryKey: PEOPLE_KEY });
      if (follow) toast({ icon: 'check', title: 'Following', detail: 'You’ll hear when they open a room' });
    },
  });

  return {
    toggle: (id: string, follow: boolean) => mutation.mutate({ id, follow }),
    /** A request for this person is in flight. */
    isBusy: (id: string) => mutation.isPending && mutation.variables.id === id,
    error: mutation.error,
  };
}
