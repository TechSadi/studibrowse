import { expect, test } from '@playwright/test';
import { makeNotification, makeUser, mockApi, type MockApi } from './fixtures/mockApi';

test.describe('Notifications', () => {
  let api: MockApi;

  test.beforeEach(async ({ page }) => {
    api = await mockApi(page);
    api.signIn(api.addAccount(makeUser(), 'right-pass-1'));
    api.notifications = [
      makeNotification({ id: 'opened', text: 'Maya Kapoor opened a room' }),
      makeNotification({
        id: 'full',
        type: 'roomFull',
        text: 'Your room is full',
        roomName: 'Finals week focus',
        read: true,
        createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      }),
    ];
  });

  test('lists Today and Earlier, filters, and marks everything read', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Earlier' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Maya Kapoor opened a room/ })).toContainText('Join');

    await page.getByRole('radio', { name: 'Unread' }).click();
    await expect(page).toHaveURL(/filter=unread/);
    await expect(page.getByText('Your room is full')).toBeHidden();

    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect.poll(() => api.calls.markRead).toEqual([{ all: true }]);
    await expect(page.getByText('Nothing here. You’re all caught up.')).toBeVisible();
  });

  test('the bell opens the latest and closes with Escape', async ({ page }) => {
    await page.goto('/progress');
    const bell = page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .locator('..')
      .getByRole('button', { name: 'Notifications, 1 unread' });
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText('Maya Kapoor opened a room')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(bell).toBeFocused();
  });

  test('never asks for browser notifications until you click Enable', async ({ page }) => {
    // Headless Chromium answers "denied" up front, so stand in a browser that hasn't been asked yet.
    await page.addInitScript(() => {
      const record = window as unknown as { asked: number };
      record.asked = 0;
      class UnaskedNotification {
        static permission: NotificationPermission = 'default';
        static requestPermission() {
          record.asked += 1;
          UnaskedNotification.permission = 'granted';
          return Promise.resolve<NotificationPermission>('granted');
        }
      }
      Object.defineProperty(window, 'Notification', { value: UnaskedNotification, configurable: true });
    });
    const asked = () => page.evaluate(() => (window as unknown as { asked: number }).asked);

    await page.goto('/notifications');
    const banner = page.getByRole('region', { name: 'Browser notifications' });
    await expect(banner).toBeVisible();
    expect(await asked()).toBe(0);
    await banner.getByRole('button', { name: 'Enable' }).click();
    await expect.poll(asked).toBe(1);
    await expect(banner).toBeHidden();
  });

  test('works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/notifications');
    await expect(page.getByRole('button', { name: /Maya Kapoor opened a room/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
