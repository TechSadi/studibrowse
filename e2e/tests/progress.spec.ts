import { expect, test } from '@playwright/test';
import { makeMySession, makeProgress, makeUser, mockApi, type MockApi } from './fixtures/mockApi';

test.describe('Progress', () => {
  let api: MockApi;

  test.beforeEach(async ({ page }) => {
    api = await mockApi(page);
    api.signIn(api.addAccount(makeUser({ weeklyGoalMins: 720 }), 'right-pass-1'));
  });

  test('shows a new user empty states', async ({ page }) => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible();
    await expect(page.getByText('Finish a focus round to start your week.')).toBeVisible();
    await expect(page.getByText('Finish a focus round to see it here.')).toBeVisible();
    await expect(page.getByText('No sessions yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find a room' })).toHaveAttribute('href', '/home#live');
  });

  test('shows the week, the chart and pages through history with the keyboard', async ({ page }) => {
    const progress = makeProgress();
    api.progress = {
      ...progress,
      days: progress.days.map((day, index) => ({ ...day, focusMins: [95, 140, 75, 170, 40, 0, 0][index]! })),
      week: { focusMins: 520, goalMins: 720, sessions: 14, people: 23, rooms: 9 },
      streak: { current: 6, longest: 11, studiedToday: true },
    };
    api.mySessions = Array.from({ length: 12 }, (_, index) =>
      makeMySession({ roomName: `Room ${index + 1}` }),
    );

    await page.goto('/progress');
    await expect(page.getByText('8h 40m')).toBeVisible();
    await expect(page.getByText('With 23 different people across 9 rooms')).toBeVisible();
    await expect(page.getByRole('img', { name: /^Focus time by day/ })).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Sidebar' }).getByText('6-day streak'),
    ).toBeVisible();

    const table = page.getByRole('region', { name: 'Session history table' });
    await expect(table.getByRole('row')).toHaveCount(11);
    await expect(table.getByText('Room 1', { exact: true })).toBeVisible();

    const older = page.getByRole('button', { name: 'Older' });
    await older.focus();
    await page.keyboard.press('Enter');
    await expect(table.getByText('Room 11', { exact: true })).toBeVisible();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(table).toBeFocused();
    await expect(older).toBeDisabled();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`fits a phone screen in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.emulateMedia({ colorScheme });
      api.mySessions = [makeMySession()];
      await page.goto('/progress');

      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await expect(page.getByRole('img', { name: /^Focus time by day/ })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Session history table' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
