import { expect, test } from '@playwright/test';
import type { HealthResponse } from '@studibrowse/shared';

test('home page loads and shows the server status', async ({ page }) => {
  const health: HealthResponse = { ok: true, db: 'up' };
  await page.route('/api/health', (route) => route.fulfill({ json: health }));

  await page.goto('/');

  await expect(page).toHaveTitle(/StudiBrowse/);
  await expect(page.getByRole('heading', { name: 'StudiBrowse' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Server up, database up.');
});
