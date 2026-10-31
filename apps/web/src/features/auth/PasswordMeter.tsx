import styles from './PasswordMeter.module.css';
import { passwordScore } from './passwordStrength';

/** The 4-bar strength meter. The matching hint text is rendered by the password field. */
export function PasswordMeter({ password }: { password: string }) {
  const score = passwordScore(password);
  return (
    <div className={score ? `${styles.meter} ${styles[`s${score}`]}` : styles.meter} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
