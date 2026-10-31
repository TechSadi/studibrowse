import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/mockApi';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Welcome fits a phone screen in ${colorScheme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme });
    await mockApi(page);
    await page.goto('/');

    // Follows the device theme by default.
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

    const hero = page.getByRole('heading', { level: 1, name: 'Study with people, not alone.' });
    await expect(hero).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    // The live-room preview stacks below the hero text on phones.
    const heroBox = await hero.boundingBox();
    const previewBox = await page.getByText('Late-night exam grind').boundingBox();
    expect(heroBox && previewBox && previewBox.y > heroBox.y + heroBox.height).toBe(true);

    // Phones show only the theme button and "Sign up free" in the nav.
    await expect(page.getByRole('link', { name: 'Sign up free' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeHidden();
  });
}

test('the theme toggle overrides the device and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await mockApi(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Switch light or dark mode' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('sb-theme'))).toBe('light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
