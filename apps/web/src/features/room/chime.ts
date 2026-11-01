// The timer's sounds, made with Web Audio so there are no audio files to load.

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  context = new window.AudioContext();
  return context;
}

/**
 * Browsers only let audio start after the person has interacted with the page. Call this from a click or key
 * press, so a sound that arrives later (from the server, with no gesture) can play.
 */
export function unlockChime(): void {
  const ctx = audioContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

interface Note {
  freq: number;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds until the note has faded out. */
  length: number;
}

function playNotes(notes: Note[], type: OscillatorType, peak: number): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime;
  for (const { freq, at, length } of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(peak, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + length + 0.05);
  }
}

/** A round or break ended: two soft, slow sine notes (E5, A5). */
export function playChime(): void {
  playNotes(
    [
      { freq: 659.25, at: 0, length: 1.2 },
      { freq: 880, at: 0.18, length: 1.2 },
    ],
    'sine',
    0.12,
  );
}

/** The host started focusing: three quick rising notes (C5, E5, G5), brighter so it reads as "go". */
export function playStartSound(): void {
  playNotes(
    [
      { freq: 523.25, at: 0, length: 0.35 },
      { freq: 659.25, at: 0.09, length: 0.35 },
      { freq: 783.99, at: 0.18, length: 0.6 },
    ],
    'triangle',
    0.1,
  );
}
