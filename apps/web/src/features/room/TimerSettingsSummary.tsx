import type { TimerSettings } from '@studibrowse/shared';
import styles from './TimerSettingsSummary.module.css';

/** The timer settings under the controls (mockup `#timerMeta`). */
export function TimerSettingsSummary({ settings }: { settings: TimerSettings }) {
  return (
    <div className={styles.meta}>
      <span>
        Focus <b>{settings.focusMins}m</b>
      </span>
      <span>
        Short break <b>{settings.shortBreakMins}m</b>
      </span>
      <span>
        Long break <b>{settings.longBreakMins}m</b> every {settings.roundsBeforeLong}
      </span>
      <span>
        Auto-start <b>{settings.autoStart ? 'on' : 'off'}</b>
      </span>
    </div>
  );
}
