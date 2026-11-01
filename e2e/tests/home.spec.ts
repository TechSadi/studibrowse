import { expect, test } from '@playwright/test';
import { makeRoom, makeUser, mockApi, type MockApi } from './fixtures/mockApi';
import { mockSocket } from './fixtures/mockSocket';

test.describe('Home and the app shell', () => {
  let api: MockApi;

  test.beforeEach(async ({ page }) => {
    api = await mockApi(page);
    const maya = api.addAccount(makeUser({ id: 'u2', name: 'Maya Kapoor', username: 'mayak' }), 'pass-12345');
    api.signIn(api.addAccount(makeUser({ following: [maya.id] }), 'right-pass-1'));
  });

  test('shows the sidebar, top bar and Home sections with empty states', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.getByRole('link', { name: /Maya Kapoor/ })).toHaveAttribute('href', '/u/mayak');
    await expect(sidebar.getByText('No streak yet')).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /create/i })).toHaveCount(0);

    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Home');
    await expect(page.getByRole('heading', { name: 'Your focus this week' })).toBeVisible();
    await expect(page.getByText('No live rooms right now')).toBeVisible();
    await expect(page.getByText('No sessions yet')).toBeVisible();
  });

  test('is keyboard navigable: skip link, menu and the / search shortcut', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('complementary').getByRole('link', { name: 'Home' })).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Search rooms', exact: true })).toBeFocused();
  });

  test('moves between pages from the sidebar', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('complementary').getByRole('link', { name: 'Your progress' }).click();
    await expect(page).toHaveURL('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible();
    await expect(page).toHaveTitle('Your progress · StudiBrowse');
  });

  test('uses a bottom tab bar on phones', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /, Alex$/ })).toBeVisible();

    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('link')).toHaveText(['Home', 'Progress', 'Settings']);

    await tabs.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL('/home?create=1');

    // Nothing scrolls sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('shows the 404 page for an unknown path', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL('/home');
  });

  test('lists public rooms as cards, people you follow first', async ({ page }) => {
    const maya = api.accounts.find((a) => a.user.id === 'u2')!.user;
    const jordan = api.addAccount(
      makeUser({ id: 'u3', name: 'Jordan Lee', username: 'jordan' }),
      'pass-12345',
    );
    api.rooms.push(
      makeRoom(jordan, { id: 'room-j', name: 'Late-night exam grind', memberCount: 14 }),
      makeRoom(maya, { id: 'room-m', name: 'Finals week focus', memberCount: 20 }),
      makeRoom(maya, { id: 'room-p', name: 'Secret study', isPublic: false }),
    );
    await page.goto('/home');

    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('You follow Maya');
    await expect(cards.first().getByRole('button', { name: 'Room is full' })).toBeDisabled();
    const grind = page.getByRole('article', { name: 'Late-night exam grind' });
    await expect(grind.getByText('Live')).toBeVisible();
    await expect(grind.getByLabel('14 of 20 people')).toHaveText('14/20');
    await expect(page.getByText('Secret study')).toHaveCount(0);
  });

  test('creates a room and shows its invite link', async ({ page }) => {
    // Opening the room joins it over the socket: answer with the room just created, its creator as host.
    await mockSocket(page, {
      'room:join': ({ roomId }) => {
        const room = api.rooms.find((r) => r.id === roomId);
        if (!room) throw new Error(`room:join for a room the mock didn't create: ${roomId}`);
        const { host } = room;
        const member = {
          userId: host.id,
          name: host.name,
          username: host.username,
          avatarColor: host.avatarColor,
          status: 'break' as const,
          workingOn: '',
          isHost: true,
          joinedAt: new Date().toISOString(),
          focusingSince: null,
        };
        return {
          room: { ...room, memberCount: 1 },
          members: [member],
          resources: [],
          messages: [],
          serverNow: Date.now(),
        };
      },
    });
    await page.goto('/home');
    await page.getByRole('button', { name: 'Create a room' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create a study room' });
    await expect(dialog.getByLabel('Room name')).toBeFocused();

    await dialog.getByRole('button', { name: 'Create and open' }).click();
    await expect(
      dialog.getByText('Give your room a name so people know what they’re joining.'),
    ).toBeVisible();

    await dialog.getByLabel('Room name').fill('Torts revision');
    await dialog.getByLabel(/Subject/).fill('Law');
    await dialog.getByRole('radio', { name: /Private/ }).click();
    await dialog.getByRole('button', { name: 'More total rounds' }).click();
    await dialog.getByRole('button', { name: 'Create and open' }).click();

    await expect(page).toHaveURL(/\/room\/room-1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Torts revision' })).toBeVisible();
    // The room bar has no link field (mockup `#copyInvite`): the invite link is what Copy invite copies.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy invite' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/r\/aB3xK9_q-2$/);
    expect(api.calls.createRoom?.[0]).toMatchObject({
      name: 'Torts revision',
      subject: 'Law',
      isPublic: false,
      maxSize: 10,
      timerSettings: { totalRounds: 5, autoStart: true },
    });
  });

  test('closes the Create a room dialog with Escape and returns focus', async ({ page }) => {
    await page.goto('/home');
    const open = page.getByRole('button', { name: 'Create a room' }).first();
    await open.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL('/home');
    await expect(open).toBeFocused();
  });

  test('fits the Create a room dialog at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/home?create=1');
    await expect(page.getByRole('dialog', { name: 'Create a study room' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
