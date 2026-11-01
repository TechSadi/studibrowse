import { expect, test, type Page } from '@playwright/test';
import { makeUser, mockApi, type MockApi } from './fixtures/mockApi';

async function startOnboarding(page: Page, { withSuggestion = true } = {}): Promise<MockApi> {
  const api = await mockApi(page);
  const user = api.addAccount(makeUser({ onboardedAt: null }), 'right-pass-1');
  if (withSuggestion) {
    api.addAccount(
      makeUser({ id: 'maya', name: 'Maya Kapoor', username: 'mayak', studying: 'Pharmacy, year 3' }),
      'other-pass-1',
    );
  }
  api.signIn(user);
  await page.goto('/onboarding');
  return api;
}

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });

test.describe('Onboarding', () => {
  test('walks through the three steps, survives a refresh, and lands on Home', async ({ page }) => {
    const api = await startOnboarding(page);

    await expect(heading(page, 'Set up your profile')).toBeVisible();
    await page.getByRole('radio', { name: 'Blue' }).click();
    await page.getByLabel(/What are you studying/).fill('Computer Science, year 2');
    await page.getByRole('button', { name: 'Programming' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(heading(page, 'Pick a weekly focus goal')).toBeVisible();
    expect(api.calls.updateMe?.[0]).toEqual({
      avatarColor: 'blue',
      studying: 'Computer Science, year 2',
      subjects: ['Programming'],
    });

    await page.getByRole('radio', { name: /20h/ }).click();
    await page.getByRole('button', { name: 'More focus' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(heading(page, 'Follow a few people')).toBeVisible();

    // A refresh keeps the step and the saved answers.
    await page.reload();
    await expect(heading(page, 'Follow a few people')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('radio', { name: /20h/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('group', { name: 'Focus' }).getByText('30m')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel(/What are you studying/)).toHaveValue('Computer Science, year 2');

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    const follow = page.getByRole('button', { name: 'Follow Maya Kapoor' });
    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    expect(api.calls.follow).toEqual(['maya']);

    await page.getByRole('button', { name: 'Start studying' }).click();
    await expect(page).toHaveURL('/home');
    await expect(page.getByText('You’re all set')).toBeVisible();

    await page.goto('/onboarding');
    await expect(page).toHaveURL('/home');
  });

  test('shows an empty state when there is no one to follow', async ({ page }) => {
    await startOnboarding(page, { withSuggestion: false });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('No one to suggest yet.')).toBeVisible();
  });

  test('Skip for now finishes onboarding with what was saved', async ({ page }) => {
    const api = await startOnboarding(page);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL('/home');
    expect(api.calls.updateMe).toEqual([{ onboarded: true }]);
  });

  test('fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await startOnboarding(page);
    for (const title of ['Set up your profile', 'Pick a weekly focus goal', 'Follow a few people']) {
      await expect(heading(page, title)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      if (title !== 'Follow a few people') await page.getByRole('button', { name: 'Continue' }).click();
    }
  });
});
