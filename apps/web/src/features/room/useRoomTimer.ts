import { useEffect, useRef, useState } from 'react';
import type { RoomTimer } from '@studibrowse/shared';
import { useSocketEvent } from '../../hooks/useSocket';
import { clockOffset, timeLeftMs } from './roomClock';

/** A timer as the server sent it (the room:join ack or a timer:state), with its clock at that moment. */
export interface TimerSnapshot {
  timer: RoomTimer;
  serverNow: number;
}

/** The room's timer and how far this device's clock is from the server's. Changes only when the server says so. */
export interface RoomClock {
  timer: RoomTimer;
  offset: number;
}

function receive({ timer, serverNow }: TimerSnapshot): RoomClock {
  return { timer, offset: clockOffset(serverNow, Date.now()) };
}

/**
 * The room's shared timer as the server last sent it. Starts from `initial` (the join ack; pass a new object to
 * start over) and follows `timer:state`. It doesn't tick: pair it with useTimeLeft in the one component that
 * draws the countdown, so the rest of the room doesn't re-render every second.
 */
export function useRoomClock(roomId: string, initial: TimerSnapshot): RoomClock {
  const [clock, setClock] = useState(() => receive(initial));

  const initialRef = useRef(initial);
  useEffect(() => {
    if (initialRef.current === initial) return;
    initialRef.current = initial;
    setClock(receive(initial));
  }, [initial]);

  useSocketEvent('timer:state', (payload) => {
    if (payload.roomId === roomId) setClock(receive(payload));
  });

  return clock;
}

// A few ms past the boundary, so the read lands on the new second rather than just before it.
const BOUNDARY_SLACK_MS = 5;

/** How long until a clock showing whole seconds (rounded up) next changes. */
function untilNextSecond(left: number): number {
  return ((left - 1) % 1000) + 1 + BOUNDARY_SLACK_MS;
}

/**
 * Milliseconds left in the phase, recomputed from `endsAt` (never counted down on its own) each time the shown
 * second changes. Null when idle or done. Uses timers rather than animation frames so it keeps going in a
 * background tab, where the tab title still shows the time.
 */
export function useTimeLeft({ timer, offset }: RoomClock): number | null {
  const [remainingMs, setRemainingMs] = useState(() => timeLeftMs(timer, Date.now(), offset));

  useEffect(() => {
    const read = () => timeLeftMs(timer, Date.now(), offset);
    const first = read();
    // A new timer from the server (a phase change or a host command, never a tick) is drawn at once. Reading the
    // clock can't happen during render, so this one extra render is the price.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemainingMs(first);
    if (!timer.endsAt || !first) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const schedule = (left: number) => {
      timeout = setTimeout(() => {
        const now = read() ?? 0;
        setRemainingMs(now);
        // At zero the server is about to send the next phase; nothing left to draw until then.
        if (now > 0) schedule(now);
      }, untilNextSecond(left));
    };
    schedule(first);
    return () => clearTimeout(timeout);
  }, [timer, offset]);

  return remainingMs;
}
