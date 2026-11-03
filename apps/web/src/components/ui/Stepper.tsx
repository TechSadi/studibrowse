import type { ReactNode } from 'react';
import styles from './Stepper.module.css';

interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Appended to the value, e.g. "m" for "25m". */
  unit?: string;
  /** Keeps the label for screen readers only, when the row around it already names it. */
  hideLabel?: boolean;
}

/** A −/+ number control (timer settings, weekly goal). Clamped to min..max. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit = '',
  hideLabel = false,
}: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className={styles.stepper}>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <div role="group" aria-label={label}>
        <button
          type="button"
          aria-label={`Less ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => set(value - step)}
        >
          −
        </button>
        <output className="num" aria-live="polite">
          {value}
          {unit}
        </output>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => set(value + step)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function StepperGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
