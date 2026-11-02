import { useState } from 'react';
import type { RoomTimer, TimerSettings } from '@studibrowse/shared';
import { phaseMs } from './timerView';

/**
 * The timer settings the current phase was timed with. The host's changes apply from the next phase, so a
 * phase already under way keeps drawing its ring against its own length. Only a phase that hasn't started
 * yet (idle, or waiting for the host at the new full length) follows the new settings straight away.
 */
export function usePhaseSettings(timer: RoomTimer, settings: TimerSettings): TimerSettings {
  const key = `${timer.phase}:${timer.round}`;
  const [held, setHeld] = useState({ key, settings });
  const notStarted =
    timer.phase === 'idle' ||
    (timer.endsAt === null && timer.pausedRemaining === phaseMs(timer.phase, settings));
  if (held.key !== key || (notStarted && held.settings !== settings)) {
    // Adjusting state while rendering: React redraws with it before anything is shown.
    setHeld({ key, settings });
    return settings;
  }
  return held.settings;
}
