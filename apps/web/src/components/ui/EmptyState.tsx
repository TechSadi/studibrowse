import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  /** A button or link under the text. */
  action?: ReactNode;
  className?: string;
}

/** Dashed box for a list with nothing in it yet (`.empty` in the mockup). */
export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div className={className ? `${styles.empty} ${className}` : styles.empty}>
      <b className={styles.title}>{title}</b>
      {children ? <p>{children}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
