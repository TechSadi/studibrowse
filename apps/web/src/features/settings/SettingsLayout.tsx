import { useState, type ReactNode } from 'react';
import { Switch } from '../../components/ui/Switch';
import styles from './Settings.module.css';

interface SectionProps {
  id: string;
  title: string;
  description: string;
  danger?: boolean;
  children: ReactNode;
}

/** One card on the Settings page (`.set-sec`). Its id is what the side nav scrolls to. */
export function SettingsSection({ id, title, description, danger = false, children }: SectionProps) {
  return (
    <section
      id={id}
      className={danger ? `${styles.sec} ${styles.danger}` : styles.sec}
      aria-labelledby={`${id}-title`}
      // The side nav moves focus here.
      tabIndex={-1}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p className={styles.secText}>{description}</p>
      {children}
    </section>
  );
}

interface RowProps {
  title: string;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** A label on the left and a control on the right (`.set-row`). */
export function SettingRow({ title, hint, className, children }: RowProps) {
  return (
    <div className={className ? `${styles.row} ${className}` : styles.row}>
      <div>
        <b>{title}</b>
        {hint ? <small>{hint}</small> : null}
      </div>
      {children}
    </div>
  );
}

interface SwitchRowProps {
  title: string;
  hint?: string;
  /** The switch's accessible name. */
  label: string;
  checked: boolean;
  /** Saves the new value. Resolves to whether it saved. */
  onSave: (checked: boolean) => Promise<boolean>;
}

/** A setting row with a switch that flips at once and flips back if saving fails. */
export function SwitchRow({ title, hint, label, checked, onSave }: SwitchRowProps) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  return (
    <SettingRow title={title} hint={hint}>
      <Switch
        label={label}
        checked={optimistic ?? checked}
        onChange={(next) => {
          setOptimistic(next);
          // Once saved, the user from the server carries the new value; on failure the old one shows again.
          void onSave(next).finally(() => setOptimistic(null));
        }}
      />
    </SettingRow>
  );
}
