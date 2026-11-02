import { useCallback, useState } from 'react';
import type { PresenceMember } from '@studibrowse/shared';
import { useToast } from '../../components/ui/Toast';
import { emitWithAck } from '../../lib/socket';
import { firstName } from './people';

export interface HostActions {
  /** One of them is on its way to the server. */
  busy: boolean;
  makeHost: (member: PresenceMember) => Promise<void>;
  /** Resolves once the server has answered, whether or not it worked (a refusal is shown as a toast). */
  remove: (member: PresenceMember) => Promise<void>;
}

/** The host's actions on someone in the room: host:transfer and member:remove. The server checks both. */
export function useHostActions(roomId: string): HostActions {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (send: () => Promise<unknown>, onDone: () => void) => {
      setBusy(true);
      try {
        await send();
        onDone();
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Something went wrong. Try again.';
        toast({ icon: 'x', title: 'That didn’t go through', detail });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const makeHost = useCallback(
    (member: PresenceMember) =>
      run(
        () => emitWithAck('host:transfer', { roomId, userId: member.userId }),
        () =>
          toast({
            icon: 'crown',
            title: `${firstName(member.name)} is now the host`,
            detail: 'They control the timer and room settings.',
          }),
      ),
    [roomId, run, toast],
  );

  const remove = useCallback(
    (member: PresenceMember) =>
      run(
        () => emitWithAck('member:remove', { roomId, userId: member.userId }),
        () =>
          toast({
            icon: 'users',
            title: `${firstName(member.name)} was removed`,
            detail: 'They can’t rejoin this room.',
          }),
      ),
    [roomId, run, toast],
  );

  return { busy, makeHost, remove };
}
