import { expect, test } from '@playwright/test';
import type { FollowListUser, PublicUser, RoomSummary, UserProfile } from '@studibrowse/shared';
import { makeRoom, makeUser, mockApi, type MockApi } from './fixtures/mockApi';

function makeProfile(user: PublicUser, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarColor: user.avatarColor,
    studying: 'Pharmacy, year 3',
    subjects: ['Pharmacology', 'Organic chem', 'Exam prep'],
    joinedAt: '2026-03-14T10:00:00.000Z',
    followerCount: 25,
    followingCount: 64,
    isFollowing: false,
    isMe: false,
    stats: { focusMinsThisMonth: 42 * 60, streak: 19, roomsHosted: 27 },
    hostingNow: null,
    recentRooms: [
      {
        roomId: 'room-old',
        name: 'Pharmacology flashcards',
        startedAt: '2026-10-29T18:00:00.000Z',
        role: 'hosted',
        hostName: null,
        people: 9,
        focusedMins: 100,
        inProgress: false,
      },
    ],
    studiedTogether: 6,
    ...overrides,
  };
}

function follower(index: number): FollowListUser {
  return {
    id: `f${index}`,
    name: `Follower ${index}`,
    username: `follower${index}`,
    avatarColor: 'blue',
    studying: '',
    isFollowing: false,
  };
}

test.describe('Profiles', () => {
  let api: MockApi;
  let maya: PublicUser;

  test.beforeEach(async ({ page }) => {
    api = await mockApi(page);
    maya = api.addAccount(
      makeUser({ id: 'u2', name: 'Maya Kapoor', username: 'mayak', avatarColor: 'gold' }),
      'pass-12345',
    );
    api.signIn(api.addAccount(makeUser(), 'right-pass-1'));
    const {
      goals: _goals,
      description: _d,
      inviteCode: _c,
      isHost: _h,
      totalSessions: _s,
      totalFocusMins: _f,
      ...card
    } = makeRoom(maya, { id: 'room-live', name: 'Late-night exam grind', memberCount: 14 });
    const hosting: RoomSummary = { ...card, hostFollowed: false };
    api.profiles.mayak = makeProfile(maya, { hostingNow: hosting });
    api.followLists['mayak/followers'] = Array.from({ length: 25 }, (_, i) => follower(i + 1));
    // Without a share sheet the button copies the link, which a test can check.
    await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  });

  test('shows the profile: hosting now, stats, recent rooms, about and followers', async ({ page }) => {
    await page.goto('/u/mayak');
    await expect(page.getByRole('heading', { level: 1, name: 'Maya Kapoor' })).toBeVisible();
    await expect(page.getByText('@mayak · Pharmacy, year 3 · Joined March 2026')).toBeVisible();

    const hosting = page.getByRole('region', { name: 'Hosting now' });
    await expect(hosting.getByText('Hosting Late-night exam grind')).toBeVisible();
    await expect(hosting.getByRole('link', { name: 'Join Late-night exam grind' })).toHaveAttribute(
      'href',
      '/room/room-live',
    );

    await expect(page.getByText('42h')).toBeVisible();
    await expect(page.getByText('day streak')).toBeVisible();
    await expect(page.getByText('Pharmacology flashcards')).toBeVisible();
    await expect(page.getByText('You and Maya studied together in 6 rooms.')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Profile');
  });

  test('follows from the profile and adds them to the sidebar', async ({ page }) => {
    await page.goto('/u/mayak');
    const follow = page.getByRole('button', { name: 'Follow Maya Kapoor' });
    await follow.click();
    await expect(follow).toHaveText('Following');
    await expect(page.getByText('You’ll hear when they open a room')).toBeVisible();
    expect(api.calls.follow).toEqual(['u2']);
    await expect(
      page.getByRole('complementary', { name: 'Sidebar' }).getByRole('link', { name: /Maya Kapoor/ }),
    ).toBeVisible();
  });

  test('lists followers in a dialog, a page at a time', async ({ page }) => {
    await page.goto('/u/mayak');
    await page.getByRole('button', { name: /25 followers/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Followers' });
    await expect(dialog.getByRole('listitem')).toHaveCount(20);
    await dialog.getByRole('button', { name: 'Show more' }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(25);
    await expect(dialog.getByRole('button', { name: 'Show more' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('copies the profile link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/u/mayak');
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByText('Profile link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/u\/mayak$/);
  });

  test('says when nobody has that username', async ({ page }) => {
    await page.goto('/u/nobody');
    await expect(page.getByText('We couldn’t find @nobody')).toBeVisible();
  });

  test('fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/u/mayak');
    await expect(page.getByRole('heading', { level: 1, name: 'Maya Kapoor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Follow Maya Kapoor' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
