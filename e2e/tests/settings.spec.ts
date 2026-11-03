import { expect, test } from '@playwright/test';
import { makeUser, mockApi, type MockApi } from './fixtures/mockApi';

test.describe('Settings', () => {
  let api: MockApi;

  test.beforeEach(async ({ page }) => {
    api = await mockApi(page);
    api.signIn(api.addAccount(makeUser(), 'right-pass-1'));
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });

  test('keeps the chosen theme across a reload', async ({ page }) => {
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.getByText('Appearance saved')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.reload();
    // Applied before first paint, so it's already there when the page is.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('sb-theme'))).toBe('dark');
  });

  test('saves a notification toggle', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Someone joins' });
    await toggle.click();
    await expect(page.getByText('Notifications saved')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(api.calls.updateMe).toEqual([{ notificationPrefs: { memberJoined: false } }]);

    await page.reload();
    await expect(page.getByRole('switch', { name: 'Someone joins' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('works at phone width with the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    const noSideScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noSideScroll).toBe(true);

    const system = page.getByRole('radio', { name: 'System' });
    await system.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Light' })).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('deletes the account after typing the username', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
    const confirm = dialog.getByRole('button', { name: 'Delete account' });
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel(/to confirm/).fill('alexsmith');
    await confirm.click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Account deleted')).toBeVisible();
    expect(api.calls.deleteMe).toEqual([{ username: 'alexsmith' }]);
    expect(api.accounts).toHaveLength(0);
  });
});
