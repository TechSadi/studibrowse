import type { ReactNode } from 'react';
import { EmptyState } from '../ui/EmptyState';
import styles from './ComingSoon.module.css';

interface ComingSoonProps {
  title: string;
  /** What the page will hold, for the empty state. */
  children: ReactNode;
  action?: ReactNode;
}

/** A signed-in page that isn't built yet: its heading and an empty state, inside the app shell. */
export function ComingSoon({ title, children, action }: ComingSoonProps) {
  return (
    <>
      <h1 className={styles.title}>{title}</h1>
      <EmptyState title="Coming in a later update" action={action}>
        {children}
      </EmptyState>
    </>
  );
}
