import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimerPhase } from '@studibrowse/shared';
import { useTimerSounds } from './useTimerSounds';

const playChime = vi.fn();
const playStartSound = vi.fn();
vi.mock('./chime', () => ({
  playChime: () => playChime() as unknown,
  playStartSound: () => playStartSound() as unknown,
  unlockChime: () => undefined,
}));

function renderSounds(phase: TimerPhase = 'focus') {
  return renderHook(({ phase }) => useTimerSounds(phase), { initialProps: { phase } });
}

beforeEach(() => {
  playChime.mockReset();
  playStartSound.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe('useTimerSounds', () => {
  it('plays the start sound when the host starts focusing, including Start again', () => {
    const { rerender } = renderSounds('idle');
    expect(playStartSound).not.toHaveBeenCalled();

    rerender({ phase: 'focus' });
    expect(playStartSound).toHaveBeenCalledTimes(1);
    expect(playChime).not.toHaveBeenCalled();

    rerender({ phase: 'done' });
    rerender({ phase: 'focus' });
    expect(playStartSound).toHaveBeenCalledTimes(2);
  });

  it('chimes when a round ends, not when the host starts or resets', () => {
    const { rerender } = renderSounds('focus');
    rerender({ phase: 'shortBreak' });
    expect(playChime).toHaveBeenCalledTimes(1);
    rerender({ phase: 'focus' });
    expect(playChime).toHaveBeenCalledTimes(2);
    // Focus after a break is the chime, not the start sound.
    expect(playStartSound).not.toHaveBeenCalled();
    rerender({ phase: 'idle' });
    expect(playChime).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when muted, and remembers it', () => {
    const { result, rerender } = renderSounds('idle');
    expect(result.current.soundOn).toBe(true);

    act(() => result.current.toggleSound());
    expect(result.current.soundOn).toBe(false);
    expect(localStorage.getItem('sb-sound')).toBe('off');
    rerender({ phase: 'focus' });
    rerender({ phase: 'shortBreak' });
    expect(playStartSound).not.toHaveBeenCalled();
    expect(playChime).not.toHaveBeenCalled();

    cleanup();
    expect(renderSounds().result.current.soundOn).toBe(false);
  });
});
