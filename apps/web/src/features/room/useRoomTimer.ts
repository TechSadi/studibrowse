import { useEffect, useRef, useState } from 'react';
import type { RoomTimer } from '@studibrowse/shared';
import { useSocketEvent } from '../../hooks/useSocket';
import { clockOffset, timeLeftMs } from './roomClock';

/** A timer as the server sent it (the room:join ack or a timer:state), with its clock at that moment. */
export interface TimerSnapshot {
  timer: RoomTimer;
  serverNow: number;
}

export interface RoomTimerView {
  timer: RoomTimer;
  /** Milliseconds left in the phase, refreshed once per second while running. Null when idle or done. */
  remainingMs: number | null;
}

interface Clock {
  timer: RoomTimer;
  offset: number;
}

function receive({ timer, serverNow }: TimerSnapshot): Clock {
  return { timer, offset: clockOffset(serverNow, Date.now()) };
}

/** Whether two values read the same on a clock that shows whole seconds. */
function sameSecond(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.ceil(a / 1000) === Math.ceil(b / 1000);
}

/**
 * The room's shared timer, drawn from the server's `endsAt` on the server's clock. It never counts down on its
 * own: every frame recomputes the time left from `endsAt`, and React only re-renders when the shown second
 * changes. Starts from `initial` (the join ack; pass a new object to start over) and follows `timer:state`.
 */
export function useRoomTimer(roomId: string, initial: TimerSnapshot): RoomTimerView {
  const [clock, setClock] = useState(() => receive(initial));
  const [remainingMs, setRemainingMs] = useState(() => timeLeftMs(clock.timer, Date.now(), clock.offset));

  const initialRef = useRef(initial);
  useEffect(() => {
    if (initialRef.current === initial) return;
    initialRef.current = initial;
    setClock(receive(initial));
  }, [initial]);

  useSocketEvent('timer:state', (payload) => {
    if (payload.roomId === roomId) setClock(receive(payload));
  });

  useEffect(() => {
    const { timer, offset } = clock;
    const read = () => timeLeftMs(timer, Date.now(), offset);
    setRemainingMs(read());
    if (!timer.endsAt) return;

    let frame = requestAnimationFrame(function draw() {
      const left = read();
      setRemainingMs((shown) => (sameSecond(shown, left) ? shown : left));
      // At zero the server is about to send the next phase; nothing left to draw until then.
      if (left !== 0) frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [clock]);

  return { timer: clock.timer, remainingMs };
}
