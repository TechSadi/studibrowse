import { expect, test } from '@playwright/test';
import { makeUser, mockApi } from './fixtures/mockApi';

test('logging out returns to Welcome and ends the session', async ({ page }) => {
  const api = await mockApi(page);
  api.signIn(api.addAccount(makeUser(), 'right-pass-1'));

  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Study with people, not alone.' })).toBeVisible();
  expect(api.sessionUserId).toBeNull();

  await page.reload();
  await expect(page).toHaveURL('/');

  await page.goto('/home');
  await expect(page).toHaveURL('/login?next=%2Fhome');
});

test('signed-in visitors skip the public pages', async ({ page }) => {
  const api = await mockApi(page);
  api.signIn(api.addAccount(makeUser(), 'right-pass-1'));

  for (const path of ['/', '/login', '/signup', '/forgot-password']) {
    await page.goto(path);
    await expect(page).toHaveURL('/home');
  }
});
