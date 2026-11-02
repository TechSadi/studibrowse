import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  browserPermission,
  dismissPrompt,
  isPromptDismissed,
  requestBrowserPermission,
} from '../../lib/browserNotifications';
import styles from './Notifications.module.css';

/** Shown until you choose: the browser hasn't been asked yet, and you haven't said "Not now". */
function useEnablePrompt() {
  const [visible, setVisible] = useState(() => browserPermission() === 'default' && !isPromptDismissed());
  return {
    visible,
    // The only place permission is requested: straight from this click.
    enable: async () => {
      await requestBrowserPermission();
      setVisible(browserPermission() === 'default');
    },
    dismiss: () => {
      dismissPrompt();
      setVisible(false);
    },
  };
}

/** The Notifications page's banner. */
export function EnableBrowserNotifications() {
  const { visible, enable, dismiss } = useEnablePrompt();
  if (!visible) return null;
  return (
    <div className={styles.enable} role="region" aria-label="Browser notifications">
      <p>
        <b>Get notified in another tab</b>
        See when someone you follow opens a room or a round ends, even while StudiBrowse is in the background.
      </p>
      <div className={styles.enableActions}>
        <Button size="sm" onClick={() => void enable()}>
          Enable
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/** The one-line version at the bottom of the bell's dropdown. */
export function EnableBrowserNotificationsLine() {
  const { visible, enable } = useEnablePrompt();
  if (!visible) return null;
  return (
    <button type="button" className={styles.enableLine} onClick={() => void enable()}>
      Enable browser notifications
    </button>
  );
}
