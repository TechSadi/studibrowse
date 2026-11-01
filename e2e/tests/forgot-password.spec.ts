import { expect, test } from '@playwright/test';
import { makeUser, mockApi, VALID_RESET_TOKEN } from './fixtures/mockApi';

test.describe('Forgot password', () => {
  test('sends the link, shows "Check your inbox", and lets you resend after a cooldown', async ({ page }) => {
    await page.clock.install();
    const api = await mockApi(page);
    await page.goto('/forgot-password');

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Enter a valid email.')).toBeVisible();

    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(
      page.getByText('We sent a reset link to alex@example.com. It expires in 30 minutes.'),
    ).toBeVisible();
    expect(api.calls.forgot).toEqual([{ email: 'alex@example.com' }]);

    const resend = page.getByRole('button', { name: /Send again/ });
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/Send again in 1:00|Send again in 0:59/);

    await page.clock.fastForward('01:01');
    await expect(resend).toBeEnabled();
    await expect(resend).toHaveText('Didn’t get it? Send again');

    await resend.click();
    await expect(page.getByText('Reset link sent again')).toBeVisible();
    expect(api.calls.forgot).toHaveLength(2);
    await expect(resend).toBeDisabled();
  });

  test('resets the password from the email link, then logs in with it', async ({ page }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser(), 'old-pass-1');

    await page.goto(`/reset-password#token=${VALID_RESET_TOKEN}`);
    await expect(page).toHaveURL('/reset-password'); // token removed from the address bar

    await page.getByLabel('New password', { exact: true }).fill('New-pass-2!');
    await page.getByRole('button', { name: 'Save new password' }).click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Password updated')).toBeVisible();
    expect(api.calls.reset?.[0]).toEqual({ token: VALID_RESET_TOKEN, password: 'New-pass-2!' });

    await page.getByLabel('Email or username').fill('alexsmith');
    await page.getByLabel('Password', { exact: true }).fill('New-pass-2!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL('/home');
  });

  test('explains an expired reset link and offers a new one', async ({ page }) => {
    await mockApi(page);
    await page.goto('/reset-password#token=expired-token');

    await page.getByLabel('New password', { exact: true }).fill('New-pass-2!');
    await page.getByRole('button', { name: 'Save new password' }).click();

    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
    await page.getByRole('link', { name: 'Request a new link' }).click();
    await expect(page).toHaveURL('/forgot-password');
  });
});
