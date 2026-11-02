// Browser (system) notifications. Permission is only ever asked for from a click on "Enable", never on load,
// and one is only shown while the tab is hidden: a visible tab already has the bell.

export type BrowserPermission = NotificationPermission | 'unsupported';

export function browserPermission(): BrowserPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

/** Call only from a user's click: browsers ignore (or penalise) requests made without one. */
export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (browserPermission() === 'unsupported') return 'unsupported';
  return Notification.requestPermission();
}

export interface BrowserNotificationInput {
  /** Notifications with the same tag replace each other, so a growing burst stays one. */
  tag: string;
  title: string;
  body: string;
  onClick: () => void;
}

/** Shows a system notification if allowed and the tab is hidden. Returns whether it did. */
export function showBrowserNotification({ tag, title, body, onClick }: BrowserNotificationInput): boolean {
  if (browserPermission() !== 'granted' || document.visibilityState !== 'hidden') return false;
  try {
    const shown = new Notification(title, { body, tag, icon: '/favicon.svg' });
    shown.onclick = () => {
      window.focus();
      onClick();
      shown.close();
    };
    return true;
  } catch {
    // Some mobile browsers only allow notifications from a service worker. The bell still has it.
    return false;
  }
}

const DISMISSED_KEY = 'sb-notif-prompt-dismissed';

export function isPromptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPrompt(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Private mode: it just shows again next time.
  }
}
