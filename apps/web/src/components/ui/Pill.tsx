import type { ReactNode } from 'react';
import styles from './Pill.module.css';

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={className ? `${styles.liveDot} ${className}` : styles.liveDot} aria-hidden="true" />
  );
}

/** Green status pill with a pulsing live dot ("47 people studying right now"). */
export function LivePill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={className ? `${styles.pill} ${className}` : styles.pill}>
      <LiveDot />
      {children}
    </span>
  );
}
