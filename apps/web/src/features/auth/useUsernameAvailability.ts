import { useQuery } from '@tanstack/react-query';
import { usernameSchema } from '@studibrowse/shared';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usersApi } from '../../lib/api';

export const USERNAME_CHECK_DELAY_MS = 400;

export type UsernameAvailability =
  | { status: 'idle' }
  | { status: 'invalid'; message: string }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'error' };

/** Live "is this username free?" check for the Sign up form, debounced so it runs once typing pauses. */
export function useUsernameAvailability(username: string): UsernameAvailability {
  const debounced = useDebouncedValue(username, USERNAME_CHECK_DELAY_MS);
  const parsed = usernameSchema.safeParse(debounced);
  const checked = parsed.success ? parsed.data : null;

  const query = useQuery({
    queryKey: ['username-available', checked],
    queryFn: ({ signal }) => usersApi.usernameAvailable(checked ?? '', signal),
    enabled: checked !== null,
    staleTime: 30_000,
    retry: false,
  });

  if (!username) return { status: 'idle' };
  if (username !== debounced) {
    // Still typing: show "checking" only for values that will actually be checked.
    return usernameSchema.safeParse(username).success ? { status: 'checking' } : { status: 'idle' };
  }
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? '' };
  if (query.isError) return { status: 'error' };
  if (!query.data) return { status: 'checking' };
  return query.data.available ? { status: 'available' } : { status: 'taken' };
}
