import { useState } from 'react';
import { AccountSection } from './AccountSection';
import { AppearanceSection } from './AppearanceSection';
import { DangerSection } from './DangerSection';
import { NotificationsSection } from './NotificationsSection';
import { PrivacySection } from './PrivacySection';
import styles from './Settings.module.css';
import { TimerDefaultsSection } from './TimerDefaultsSection';

const SECTIONS = [
  { id: 'settings-account', label: 'Account', Section: AccountSection },
  { id: 'settings-appearance', label: 'Appearance', Section: AppearanceSection },
  { id: 'settings-notifications', label: 'Notifications', Section: NotificationsSection },
  { id: 'settings-timer', label: 'Timer defaults', Section: TimerDefaultsSection },
  { id: 'settings-privacy', label: 'Privacy', Section: PrivacySection },
  { id: 'settings-danger', label: 'Log out and delete', Section: DangerSection },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Settings (mockup `#settings`). Everything comes from the signed-in user, so there is nothing to load. */
export function SettingsPage() {
  const [current, setCurrent] = useState<SectionId>(SECTIONS[0].id);

  const goTo = (id: SectionId) => {
    setCurrent(id);
    const section = document.getElementById(id);
    section?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    // Move focus too, so keyboard and screen reader users land where they asked.
    section?.focus({ preventScroll: true });
  };

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1>Settings</h1>
          <p>Your account, notifications and timer defaults.</p>
        </div>
      </div>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={current === id ? styles.on : undefined}
              aria-current={current === id ? 'true' : undefined}
              onClick={() => goTo(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div>
          {SECTIONS.map(({ id, Section }) => (
            <Section key={id} id={id} />
          ))}
        </div>
      </div>
    </div>
  );
}
