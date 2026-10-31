import { expect, test, type Page } from '@playwright/test';
import { makeUser, mockApi } from './fixtures/mockApi';

async function logIn(page: Page, identifier: string, password: string) {
  await page.getByLabel('Email or username').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

test.describe('Log in', () => {
  test('shows wrong credentials inline', async ({ page }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser(), 'right-pass-1');
    await page.goto('/login');

    await logIn(page, 'alexsmith', 'wrong-pass-1');

    await expect(page.getByRole('alert')).toHaveText('That email or username and password don’t match.');
    await expect(page).toHaveURL('/login');
  });

  test('shows and hides the password', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    const password = page.getByLabel('Password', { exact: true });

    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('logs in to Home, with keep me logged in off by default, and stays in after a reload', async ({
    page,
  }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser(), 'right-pass-1');
    await page.goto('/login');

    await expect(page.getByLabel('Keep me logged in on this device')).not.toBeChecked();
    await logIn(page, 'alex@example.com', 'right-pass-1');

    await expect(page).toHaveURL('/home');
    expect(api.calls.login?.[0]).toMatchObject({ keepLoggedIn: false });

    // The access token is in memory only; the reload restores the session through the refresh cookie.
    await page.reload();
    await expect(page).toHaveURL('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();
  });

  test('sends users who have not finished onboarding to onboarding', async ({ page }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser({ onboardedAt: null }), 'right-pass-1');
    await page.goto('/login');

    await logIn(page, 'alexsmith', 'right-pass-1');

    await expect(page).toHaveURL('/onboarding');
  });

  test('returns to the page that asked for a log in', async ({ page }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser(), 'right-pass-1');

    await page.goto('/home');
    await expect(page).toHaveURL('/login?next=%2Fhome');
    await logIn(page, 'alexsmith', 'right-pass-1');

    await expect(page).toHaveURL('/home');
  });
});
