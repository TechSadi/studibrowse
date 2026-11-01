import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimerPhase } from '@studibrowse/shared';
import { playChime, playStartSound, unlockChime } from './chime';
import { isFocusStart, isRoundEnd } from './timerView';

const STORAGE_KEY = 'sb-sound';

function readSoundOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveSoundOn(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode or blocked storage: the choice lasts until the page closes.
  }
}

export interface TimerSounds {
  soundOn: boolean;
  toggleSound: () => void;
}

/**
 * The timer's sounds, for everyone in the room: a start sound when the host starts focusing, and the chime
 * when a focus round or break ends. One mute switch covers both, saved per browser.
 */
export function useTimerSounds(phase: TimerPhase): TimerSounds {
  const [soundOn, setSoundOn] = useState(readSoundOn);

  const previous = useRef(phase);
  useEffect(() => {
    if (soundOn && isFocusStart(previous.current, phase)) playStartSound();
    else if (soundOn && isRoundEnd(previous.current, phase)) playChime();
    previous.current = phase;
  }, [phase, soundOn]);

  // Audio needs a gesture before it can play; any click or key press in the room counts.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockChime);
    window.addEventListener('keydown', unlockChime);
    return () => {
      window.removeEventListener('pointerdown', unlockChime);
      window.removeEventListener('keydown', unlockChime);
    };
  }, []);

  const toggleSound = useCallback(() => {
    saveSoundOn(!soundOn);
    setSoundOn(!soundOn);
  }, [soundOn]);

  return { soundOn, toggleSound };
}
