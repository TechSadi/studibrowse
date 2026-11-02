import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestBrowserPermission, showBrowserNotification } from './browserNotifications';

let visibility: DocumentVisibilityState;
const created: {
  title: string;
  options: NotificationOptions;
  close: () => void;
  onclick: (() => void) | null;
}[] = [];

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(() => Promise.resolve<NotificationPermission>('granted'));
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {
    created.push(this);
  }
}

beforeEach(() => {
  visibility = 'hidden';
  FakeNotification.permission = 'granted';
  vi.stubGlobal('Notification', FakeNotification);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  created.length = 0;
  FakeNotification.requestPermission.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const input = (onClick = vi.fn()) => ({
  tag: 'n1',
  title: 'Maya Kapoor opened a room',
  body: 'Late-night exam grind',
  onClick,
});

describe('showBrowserNotification', () => {
  it('shows one while the tab is hidden, and clicking it runs onClick', () => {
    const onClick = vi.fn();
    expect(showBrowserNotification(input(onClick))).toBe(true);
    expect(created[0]).toMatchObject({
      title: 'Maya Kapoor opened a room',
      options: { body: 'Late-night exam grind', tag: 'n1' },
    });
    created[0]!.onclick!();
    expect(onClick).toHaveBeenCalled();
  });

  it('stays quiet while the tab is visible', () => {
    visibility = 'visible';
    expect(showBrowserNotification(input())).toBe(false);
    expect(created).toEqual([]);
  });

  it('stays quiet without permission', () => {
    FakeNotification.permission = 'default';
    expect(showBrowserNotification(input())).toBe(false);
    FakeNotification.permission = 'denied';
    expect(showBrowserNotification(input())).toBe(false);
    expect(created).toEqual([]);
  });

  it('never asks for permission by itself', () => {
    FakeNotification.permission = 'default';
    showBrowserNotification(input());
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });
});

describe('requestBrowserPermission', () => {
  it('asks the browser', async () => {
    expect(await requestBrowserPermission()).toBe('granted');
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
  });

  it('does nothing where notifications are unsupported', async () => {
    vi.unstubAllGlobals();
    const original = (window as { Notification?: unknown }).Notification;
    delete (window as { Notification?: unknown }).Notification;
    try {
      expect(await requestBrowserPermission()).toBe('unsupported');
    } finally {
      if (original) (window as { Notification?: unknown }).Notification = original;
    }
  });
});
