import { expect, test, type Page } from '@playwright/test';
import type { InvitePreviewResponse } from '@studibrowse/shared';
import { makeUser, mockApi, type MockApi } from './fixtures/mockApi';

const OPEN = 'aB3xK9_q-2';
const CLOSED = 'zZ9yX8_w-1';
const maya = makeUser({
  id: 'maya',
  name: 'Maya Kapoor',
  username: 'mayak',
  email: 'maya@example.com',
  avatarColor: 'gold',
});
const host = { id: maya.id, name: maya.name, username: maya.username, avatarColor: maya.avatarColor };

function openInvite(): InvitePreviewResponse {
  return {
    status: 'open',
    room: {
      id: 'room-1',
      name: 'Late-night exam grind',
      subject: 'Mixed subjects',
      description: 'Four focus rounds tonight. Bring whatever you’re revising.',
      host,
      memberCount: 14,
      members: [
        { initials: 'MK', avatarColor: 'gold' },
        { initials: 'JD', avatarColor: 'green' },
        { initials: 'RL', avatarColor: 'blue' },
        { initials: 'NK', avatarColor: 'purple' },
      ],
      maxSize: 20,
      timer: {
        phase: 'focus',
        round: 3,
        endsAt: new Date(Date.now() + 18 * 60_000).toISOString(),
        pausedRemaining: null,
      },
      timerSettings: { ...maya.timerDefaults, autoStart: true },
      goals: [
        { text: 'Everyone finishes one past paper', done: false },
        { text: 'No phones during focus rounds', done: false },
      ],
    },
  };
}

async function setUp(page: Page): Promise<MockApi> {
  const api = await mockApi(page);
  api.addAccount(maya, 'pass-12345');
  api.invites[OPEN] = openInvite();
  api.invites[CLOSED] = {
    status: 'closed',
    room: { name: 'Organic chem, together', host, roomsPerWeek: 3 },
  };
  return api;
}

test.describe('Invite links', () => {
  test('previews the room for a signed-out visitor', async ({ page }) => {
    await setUp(page);
    await page.goto(`/r/${OPEN}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Late-night exam grind' })).toBeVisible();
    await expect(page.getByText('invited you to study together')).toContainText('Maya Kapoor');
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await expect(page.getByLabel('14 of 20 people')).toHaveText('14/20');
    await expect(page.getByText('Everyone finishes one past paper')).toBeVisible();
    await expect(page.getByRole('img', { name: '14 studying now' })).toContainText('+10');
    await expect(page.getByText(/^Join during the break at/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up to join' })).toBeVisible();
    await expect(page).toHaveTitle('Late-night exam grind · StudiBrowse');
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await setUp(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/r/${OPEN}`);

    await expect(page.getByRole('link', { name: 'Sign up to join' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('signs up, onboards and then opens the room', async ({ page }) => {
    await setUp(page);
    await page.goto(`/r/${OPEN}`);
    await page.getByRole('link', { name: 'Sign up to join' }).click();
    await expect(page).toHaveURL(`/signup?next=${encodeURIComponent(`/r/${OPEN}`)}`);

    await page.getByLabel('Full name').fill('Alex Smith');
    await page.getByLabel('Username').fill('alexsmith');
    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Abcdefgh1!');
    await page.getByText('I agree to the').click();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding\?next=/);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(`/room/room-1?invite=${OPEN}`);
  });

  test('takes a signed-in visitor straight into the room', async ({ page }) => {
    const api = await setUp(page);
    api.signIn(api.addAccount(makeUser(), 'right-pass-1'));
    await page.goto(`/r/${OPEN}`);
    await expect(page).toHaveURL(`/room/room-1?invite=${OPEN}`);
  });

  test('shows Room closed and follows the host', async ({ page }) => {
    const api = await setUp(page);
    api.signIn(api.addAccount(makeUser(), 'right-pass-1'));
    await page.goto(`/r/${CLOSED}`);

    await expect(page.getByRole('heading', { name: 'This room has closed' })).toBeVisible();
    await expect(page.getByText('Hosts about 3 rooms a week')).toBeVisible();
    const follow = page.getByRole('button', { name: 'Follow Maya Kapoor' });
    await follow.click();
    await expect(follow).toHaveText('Following');
    expect(api.calls.follow).toEqual(['maya']);
    await expect(page.getByRole('link', { name: 'See rooms that are live now' })).toHaveAttribute(
      'href',
      '/home',
    );
  });

  test('shows not found for an unknown code', async ({ page }) => {
    await setUp(page);
    await page.goto('/r/aaaaaaaaaa');
    await expect(page.getByRole('heading', { name: 'We couldn’t find that room' })).toBeVisible();
  });
});
