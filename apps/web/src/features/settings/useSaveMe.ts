import { useCallback } from 'react';
import { updateMeSchema, type PublicUser, type UpdateMeInput } from '@studibrowse/shared';
import type { IconName } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { usersApi } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { GENERIC_ERROR, serverError } from '../auth/formErrors';

/** The signed-in user. Settings is behind RequireOnboarded, so there always is one. */
export function useMe(): PublicUser {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('Settings needs a signed-in user');
  return state.user;
}

export interface SavedToast {
  title: string;
  detail?: string;
  icon?: IconName;
}

/**
 * Saves part of your settings with PATCH /api/users/me: checks it with the shared schema first, swaps in the
 * returned user and shows the saved toast. Failures show an error toast. Resolves to whether it saved.
 */
export function useSaveMe(): (input: UpdateMeInput, saved: SavedToast) => Promise<boolean> {
  const { setUser } = useAuth();
  const toast = useToast();

  return useCallback(
    async (input, { icon = 'check', ...saved }) => {
      const parsed = updateMeSchema.safeParse(input);
      if (!parsed.success) {
        toast({
          icon: 'x',
          title: 'Couldn’t save that',
          detail: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
        });
        return false;
      }
      try {
        const { user } = await usersApi.updateMe(input);
        setUser(user);
        toast({ icon, ...saved });
        return true;
      } catch (err) {
        toast({ icon: 'x', title: 'Couldn’t save that', detail: serverError(err).message });
        return false;
      }
    },
    [setUser, toast],
  );
}
