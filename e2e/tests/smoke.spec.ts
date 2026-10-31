import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/mockApi';

test('the app loads the Welcome page for signed-out visitors', async ({ page }) => {
  await mockApi(page);

  await page.goto('/');

  await expect(page).toHaveTitle(/StudiBrowse/);
  await expect(page.getByRole('heading', { level: 1, name: 'Study with people, not alone.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up free' })).toBeVisible();
});
