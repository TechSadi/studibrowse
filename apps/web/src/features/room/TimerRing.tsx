import { LiveDot } from '../../components/ui/Pill';
import styles from './TimerRing.module.css';
import type { TimerView } from './timerView';

const RADIUS = 92;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DOT_CLASS = { done: styles.dotDone, now: styles.dotNow, todo: undefined } as const;

interface TimerRingProps {
  view: TimerView;
  /** Milliseconds left in the phase, for the spoken label. */
  remainingMs: number | null;
}

/** "12 min left", rounded up and updated once a minute, so screen readers aren't told every second. */
function spokenTimeLeft(view: TimerView, remainingMs: number | null): string {
  if (!view.running && !view.paused) return view.detail;
  const mins = Math.max(0, Math.ceil((remainingMs ?? 0) / 60_000));
  return `${view.detail}, ${mins} min left`;
}

/**
 * What screen readers hear when the timer moves on: the phase and round, never the countdown. It changes on a
 * new phase, round, pause or the end of the run, and a polite live region reads each change once.
 */
function announcement(view: TimerView): string {
  return `${view.label}. ${view.detail}`;
}

/** The shared timer: phase pill, ring, clock, round and the round dots (mockup `.timer-zone`). */
export function TimerRing({ view, remainingMs }: TimerRingProps) {
  const tone = view.tone === 'focus' ? '' : styles[view.tone];
  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement(view)}
      </p>
      <div
        className={styles.zone}
        role="timer"
        aria-label={`${view.label}. ${spokenTimeLeft(view, remainingMs)}`}
      >
        <span className={`${styles.pill} ${tone}`} aria-hidden="true">
          <LiveDot className={styles.pillDot} />
          {view.label}
        </span>
        <div className={`${styles.ring} ${tone}`} aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <circle className={styles.track} cx="100" cy="100" r={RADIUS} />
            <circle
              className={styles.progress}
              cx="100"
              cy="100"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - view.remaining)}
            />
          </svg>
          <div className={styles.center}>
            <div>
              <div className={`${styles.clock} num`}>{view.clock}</div>
              <div className={styles.detail}>{view.detail}</div>
              <div className={styles.dots}>
                {view.dots.map((dot, i) => (
                  <i key={i} className={DOT_CLASS[dot]} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
