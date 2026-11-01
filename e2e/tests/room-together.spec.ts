import { expect, test, type Page } from '@playwright/test';
import type { RoomDetail } from '@studibrowse/shared';
import { signUpPerson, type Person } from './fixtures/realAccounts';

/**
 * Three people in one room against the real server and Socket.IO: presence, the shared timer, chat and the
 * host hand-over. No fixed waits: every check is a web-first assertion or expect polling.
 */

const FOCUS_SECONDS = 25 * 60;

function peopleInRoom(page: Page) {
  return page.getByRole('region', { name: 'In the room' }).getByRole('listitem');
}

/** The ring's "MM:SS" clock, in seconds. */
async function clockSeconds(page: Page): Promise<number> {
  const text = (await page.getByRole('timer').locator('.num').textContent()) ?? '';
  const match = /^(\d+):(\d{2})$/.exec(text.trim());
  if (!match) throw new Error(`The timer doesn't show a clock: "${text}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

test.describe('A shared room', () => {
  let people: Person[] = [];

  test.afterEach(async () => {
    await Promise.all(people.map((person) => person.context.close()));
    people = [];
  });

  test('three people see each other, one timer and one chat, and the host role passes on', async ({
    browser,
    baseURL,
  }) => {
    // Three signups, three sockets and a real database: give it more than the default 30s.
    test.slow();
    people = await Promise.all(
      ['Maya Kapoor', 'Jonah Diaz', 'Priya Shah'].map((name) => signUpPerson(browser, baseURL!, name)),
    );
    const [host, jonah, priya] = people as [Person, Person, Person];

    // ---- The host creates a room ----
    await host.page.goto('/home?create=1');
    await host.page.getByLabel('Room name').fill('E2E focus room');
    const created = host.page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rooms',
    );
    await host.page.getByRole('button', { name: 'Create and open' }).click();
    const { room } = (await (await created).json()) as { room: RoomDetail };
    expect(room.inviteCode).toBeTruthy();
    await expect(host.page).toHaveURL(`/room/${room.id}`);
    await expect(host.page.getByText('You’re the host')).toBeVisible();

    // ---- Two people join with the invite link, one after the other ----
    // Jonah is fully in before Priya opens the link, so he is the longest-present member after the host.
    for (const guest of [jonah, priya]) {
      await guest.page.goto(`/r/${room.inviteCode}`);
      await expect(guest.page).toHaveURL(`/room/${room.id}?invite=${room.inviteCode}`);
      await expect(guest.page.getByRole('heading', { level: 1, name: 'E2E focus room' })).toBeVisible();
    }

    for (const person of people) {
      await expect(peopleInRoom(person.page)).toHaveCount(3);
      await expect(peopleInRoom(person.page).filter({ hasText: 'You' })).toHaveCount(1);
    }
    await expect(jonah.page.getByText(`${host.firstName} is the host and controls the timer.`)).toBeVisible();

    // ---- The host starts the timer and everyone sees the same time ----
    await host.page.getByRole('button', { name: 'Start', exact: true }).click();
    for (const person of people) {
      await expect(person.page.getByRole('timer')).toHaveAccessibleName(/^Focus\. Round 1 of 4/);
      await expect.poll(() => clockSeconds(person.page)).toBeLessThan(FOCUS_SECONDS);
    }
    // Read all three clocks at the same moment. A read can straddle a tick, so allow one second.
    await expect(async () => {
      const seconds = await Promise.all(people.map((person) => clockSeconds(person.page)));
      expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(1);
    }).toPass();

    // ---- A chat message reaches the others ----
    const message = `Starting chapter 4 now (${Math.random().toString(36).slice(2, 8)})`;
    await priya.page.getByRole('textbox', { name: 'Message' }).fill(message);
    await priya.page.getByRole('button', { name: 'Send' }).click();
    for (const person of people) {
      await expect(person.page.getByRole('log', { name: 'Room chat' })).toContainText(message);
    }

    // ---- A shared link reaches the others, and goes when its sharer removes it ----
    for (const person of people) await person.page.getByRole('tab', { name: 'Files' }).click();
    await priya.page.getByRole('textbox', { name: 'Resource title' }).fill('Past exam papers');
    await priya.page.getByRole('textbox', { name: 'Resource link' }).fill('https://example.com/papers');
    await priya.page.getByRole('button', { name: 'Share', exact: true }).click();
    for (const person of people) {
      await expect(person.page.getByRole('link', { name: 'Open Past exam papers' })).toBeVisible();
    }
    await expect(jonah.page.getByText(`Shared by ${priya.firstName}`)).toBeVisible();
    // Only the sharer and the host can remove it.
    await expect(jonah.page.getByRole('button', { name: 'Remove Past exam papers' })).toHaveCount(0);
    await priya.page.getByRole('button', { name: 'Remove Past exam papers' }).click();
    for (const person of people) {
      await expect(person.page.getByRole('link', { name: 'Open Past exam papers' })).toHaveCount(0);
    }

    // ---- The host leaves and the role passes to the next member ----
    await host.page.getByRole('button', { name: 'Leave', exact: true }).click();
    // The session summary: under a minute of focus, so nothing logged yet, and the room is still open.
    const summary = host.page.getByRole('dialog', { name: `Nice session, ${host.firstName}` });
    await expect(summary).toBeVisible();
    await expect(summary.getByText('focused')).toBeVisible();
    await expect(summary.getByRole('button', { name: 'Rejoin the room' })).toBeVisible();
    await summary.getByRole('button', { name: 'Back to home' }).click();
    await expect(host.page).toHaveURL('/home');

    for (const guest of [jonah, priya]) {
      await expect(peopleInRoom(guest.page)).toHaveCount(2);
    }
    await expect(jonah.page.getByText('You’re the host')).toBeVisible();
    // The timer kept running through the hand-over, and Jonah now has the controls.
    await expect(jonah.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect(priya.page.getByText(`Hosted by ${jonah.firstName}`)).toBeVisible();
    await expect(
      priya.page.getByText(`${jonah.firstName} is the host and controls the timer.`),
    ).toBeVisible();
    await expect(priya.page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  });
});
