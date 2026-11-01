import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Brand } from '../ui/Brand';
import { ThemeToggle } from '../ui/ThemeToggle';
import styles from './SoloScreen.module.css';

interface SoloScreenProps {
  /** Where the logo goes. */
  homeTo: string;
  /** Shown before the theme toggle, top right (the invite's Log in). */
  actions?: ReactNode;
  children: ReactNode;
}

/** A single centred card with the logo above it and no sidebar (mockup `.solo`). */
export function SoloScreen({ homeTo, actions, children }: SoloScreenProps) {
  return (
    <div className={styles.solo}>
      <header className={styles.top}>
        <Link to={homeTo} className={styles.home} aria-label="StudiBrowse home">
          <Brand />
        </Link>
        <div className={styles.right}>
          {actions}
          <ThemeToggle />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

/** The card itself (mockup `.invite-card`). */
export function SoloCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ? `${styles.card} ${className}` : styles.card}>{children}</div>;
}
