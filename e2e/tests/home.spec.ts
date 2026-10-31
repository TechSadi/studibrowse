import { expect, test } from '@playwright/test';
import { makeUser, mockApi } from './fixtures/mockApi';

test.describe('Home and the app shell', () => {
  test.beforeEach(async ({ page }) => {
    const api = await mockApi(page);
    const maya = api.addAccount(makeUser({ id: 'u2', name: 'Maya Kapoor', username: 'mayak' }), 'pass-12345');
    api.signIn(api.addAccount(makeUser({ following: [maya.id] }), 'right-pass-1'));
  });

  test('shows the sidebar, top bar and Home sections with empty states', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.getByRole('link', { name: /Maya Kapoor/ })).toHaveAttribute('href', '/u/mayak');
    await expect(sidebar.getByText('No streak yet')).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /create/i })).toHaveCount(0);

    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Home');
    await expect(page.getByRole('heading', { name: 'Your focus this week' })).toBeVisible();
    await expect(page.getByText('No live rooms right now')).toBeVisible();
    await expect(page.getByText('No sessions yet')).toBeVisible();
  });

  test('is keyboard navigable: skip link, menu and the / search shortcut', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('complementary').getByRole('link', { name: 'Home' })).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Search rooms', exact: true })).toBeFocused();
  });

  test('moves between pages from the sidebar', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('complementary').getByRole('link', { name: 'Your progress' }).click();
    await expect(page).toHaveURL('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible();
    await expect(page).toHaveTitle('Your progress · StudiBrowse');
  });

  test('uses a bottom tab bar on phones', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();

    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('link')).toHaveText(['Home', 'Progress', 'Settings']);

    await tabs.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL('/home?create=1');

    // Nothing scrolls sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('shows the 404 page for an unknown path', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL('/home');
  });
});
