import type { ReactNode } from 'react';
import styles from './CheckLine.module.css';
import { Icon } from './Icon';

interface CheckLineProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  error?: string | undefined;
}

/** The mockup's custom checkbox row, backed by a real (visually hidden) checkbox for keyboard and screen readers. */
export function CheckLine({ id, checked, onChange, children, error }: CheckLineProps) {
  return (
    <div>
      <label className={checked ? `${styles.line} ${styles.on}` : styles.line} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className={`${styles.input} sr-only`}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : undefined}
        />
        <span className={styles.box} aria-hidden="true">
          <Icon name="check" />
        </span>
        <span>{children}</span>
      </label>
      {error ? (
        <div id={`${id}-msg`} className={styles.err}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
