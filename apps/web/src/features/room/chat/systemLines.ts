import { useEffect, useRef, useState } from 'react';
import type { PresenceMember, TimerPhase } from '@studibrowse/shared';
import { firstName } from '../people';

/**
 * A grey line in the chat ("Round 2 complete · break started"), as in the mockup. Worked out on this device from
 * what it sees while you're in the room: never saved, never sent, gone on reload.
 */
export interface SystemLine {
  id: string;
  text: string;
  /** ISO timestamp, to place it among the messages. */
  at: string;
}

interface TimerPoint {
  phase: TimerPhase;
  round: number;
}

const isBreak = (phase: TimerPhase) => phase === 'shortBreak' || phase === 'longBreak';

/** What to say when the timer moves from `prev` to `next`, or null for nothing worth a line (a reset, a pause). */
export function phaseChangeText(prev: TimerPoint, next: TimerPoint): string | null {
  if (prev.phase === next.phase && prev.round === next.round) return null;
  if (next.phase === 'done') return 'Session complete · logged for everyone';
  if (isBreak(next.phase)) {
    if (prev.phase !== 'focus') return null;
    return `Round ${prev.round} complete · ${next.phase === 'longBreak' ? 'long ' : ''}break started`;
  }
  if (next.phase === 'focus')
    return prev.phase === 'done' ? 'New session started' : `Round ${next.round} started`;
  return null;
}

/** What to say when the host changes, or null when there's no host to name. */
export function hostChangeText(host: PresenceMember | undefined, myUserId: string): string | null {
  if (!host) return null;
  return host.userId === myUserId ? 'You’re now the host' : `${firstName(host.name)} is now the host`;
}

/** The system lines for this visit: "You joined the room", then timer and host changes as they happen. */
export function useSystemLines(
  phase: TimerPhase,
  round: number,
  members: PresenceMember[],
  myUserId: string,
): SystemLine[] {
  const [lines, setLines] = useState<SystemLine[]>(() => [
    { id: 'sys-0', text: 'You joined the room', at: new Date().toISOString() },
  ]);
  const nextId = useRef(1);

  const lastTimer = useRef<TimerPoint>({ phase, round });
  const host = members.find((member) => member.isHost);
  const lastHostId = useRef(host?.userId);

  useEffect(() => {
    function add(text: string) {
      const id = `sys-${nextId.current++}`;
      setLines((current) => [...current, { id, text, at: new Date().toISOString() }]);
    }

    const timerText = phaseChangeText(lastTimer.current, { phase, round });
    lastTimer.current = { phase, round };
    if (timerText) add(timerText);

    // Only a hand-over counts: a moment with no host (between leaving and the server picking one) says nothing.
    if (host && host.userId !== lastHostId.current) {
      lastHostId.current = host.userId;
      const hostText = hostChangeText(host, myUserId);
      if (hostText) add(hostText);
    }
  }, [phase, round, host, myUserId]);

  return lines;
}
