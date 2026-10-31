import { expect, test } from '@playwright/test';
import { makeUser, mockApi } from './fixtures/mockApi';

test.describe('Sign up', () => {
  test('checks the username live and shows password strength', async ({ page }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser({ username: 'maya', email: 'maya@example.com' }), 'secret-123');
    await page.goto('/signup');

    const username = page.getByLabel('Username');
    await username.fill('Maya');
    await expect(username).toHaveValue('maya'); // lowercased as you type
    await expect(page.getByText('@maya is taken')).toBeVisible();

    await username.fill('alex_smith');
    await expect(page.getByText('@alex_smith is available')).toBeVisible();

    const password = page.getByLabel('Password', { exact: true });
    await password.fill('abc');
    await expect(page.getByText('Too weak. Add more characters, numbers or symbols.')).toBeVisible();
    await password.fill('Abcdefgh1!');
    await expect(page.getByText('Strong password.')).toBeVisible();
  });

  test('validates with the shared schemas before sending', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/signup');

    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter your name.')).toBeVisible();
    await expect(page.getByText('Enter a valid email.')).toBeVisible();
    await expect(page.getByText('Agree to the terms to continue.')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeFocused();
    expect(api.calls.signup).toBeUndefined();
  });

  test('shows a taken email from the server on the email field', async ({ page }) => {
    const api = await mockApi(page);
    api.addAccount(makeUser({ username: 'someone', email: 'alex@example.com' }), 'secret-123');
    await page.goto('/signup');

    await page.getByLabel('Full name').fill('Alex Smith');
    await page.getByLabel('Username').fill('alexsmith');
    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Abcdefgh1!');
    await page.getByText('I agree to the').click();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/signup');
  });

  test('creates the account, goes to onboarding, and skips public pages afterwards', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/signup');

    await page.getByLabel('Full name').fill('Alex Smith');
    await page.getByLabel('Username').fill('alexsmith');
    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Abcdefgh1!');
    await page.getByText('I agree to the').click();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/onboarding');
    await expect(page.getByText('@alexsmith')).toBeVisible();
    expect(api.calls.signup?.[0]).toMatchObject({
      username: 'alexsmith',
      acceptTerms: true,
      keepLoggedIn: true,
    });

    await page.goto('/signup');
    await expect(page).toHaveURL('/onboarding');
  });
});
