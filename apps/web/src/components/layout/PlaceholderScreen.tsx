import { useEffect, type ReactNode } from 'react';
import { Brand } from '../ui/Brand';
import { ThemeToggle } from '../ui/ThemeToggle';
import styles from './PlaceholderScreen.module.css';

interface PlaceholderScreenProps {
  title: string;
  children: ReactNode;
}

/** Minimal centred screen for pages that aren't designed yet (404, and the Home/Onboarding stand-ins). */
export function PlaceholderScreen({ title, children }: PlaceholderScreenProps) {
  useEffect(() => {
    document.title = `${title} · StudiBrowse`;
  }, [title]);

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <Brand />
        <ThemeToggle />
      </header>
      <main className={styles.main}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
