import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MySession, MySessionsResponse, ProgressSummaryResponse, PublicUser } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeSession, makeSummary } from '../../test/progressFixtures';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

let user: PublicUser;
let summary: ProgressSummaryResponse | 'error' | 'pending';
/** Pages of history by cursor ('' is the first page). */
let pages: Record<string, MySessionsResponse> | 'error';

const fail = () =>
  Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }, { status: 500 });

function fakeFetch(input: string, init: RequestInit = {}) {
  const [path, search = ''] = input.split('?');
  const route = `${init.method ?? 'GET'} ${path}`;
  if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
  if (route === 'GET /api/progress/summary') {
    if (summary === 'pending') return new Promise<Response>(() => undefined);
    return summary === 'error' ? fail() : Response.json(summary);
  }
  if (route === 'GET /api/sessions/mine') {
    if (pages === 'error') return fail();
    const cursor = new URLSearchParams(search).get('cursor') ?? '';
    return Response.json(pages[cursor] ?? { sessions: [], nextCursor: null });
  }
  if (route === 'GET /api/users/me/following') return Response.json({ users: [] });
  throw new Error(`Unexpected request: ${route}`);
}

function onePage(sessions: MySession[], nextCursor: string | null = null): MySessionsResponse {
  return { sessions, nextCursor };
}

async function renderProgress() {
  renderRoutes('/progress');
  await screen.findByRole('heading', { level: 1, name: 'Your progress' });
}

const history = () => screen.getByRole('region', { name: 'Session history' });
const tile = (name: string) =>
  screen.getByText(name, { selector: '.eyebrow, [class*="eyebrow"]' }).parentElement!;

beforeEach(() => {
  user = makeUser({ weeklyGoalMins: 720 });
  summary = makeSummary();
  pages = { '': onePage([]) };
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('ProgressPage', () => {
  it('shows skeletons while your progress loads', async () => {
    summary = 'pending';
    await renderProgress();
    expect(screen.getByText('Loading your progress').getAttribute('role')).toBe('status');
    expect(screen.getByRole('link', { name: 'Weekly goal: 12h' }).getAttribute('href')).toBe('/settings');
  });

  it('shows this week against your goal, your streak and your sessions', async () => {
    summary = makeSummary({
      minsByDay: [95, 140, 75, 210, 0, 0, 0],
      week: { focusMins: 520, goalMins: 720, sessions: 14, people: 23, rooms: 9 },
      streak: { current: 6, longest: 11, studiedToday: true },
    });
    await renderProgress();
    await screen.findByText('With 23 different people across 9 rooms');

    const week = tile('This week');
    expect(await within(week).findByText('3h 20m to reach your goal by Saturday')).toBeDefined();
    expect(week.textContent).toContain('8h 40m / 12h');
    expect(within(week).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('72');
    expect(tile('Streak').textContent).toContain('6 days');
    expect(within(tile('Streak')).getByText('Your longest streak is 11 days')).toBeDefined();
    expect(tile('Sessions').textContent).toContain('14 this week');
    expect(within(tile('Sessions')).getByText('With 23 different people across 9 rooms')).toBeDefined();
  });

  it('draws focus time by day as an image with a text description', async () => {
    summary = makeSummary({ minsByDay: [95, 0, 0, 30, 0, 0, 0] });
    await renderProgress();
    const chart = await screen.findByRole('img', { name: 'Focus time by day, Sun 1 Nov to Sat 7 Nov' });
    expect(screen.getByText('Sun 1 Nov to Sat 7 Nov')).toBeDefined();
    expect(chart.querySelector('desc')?.textContent).toBe(
      'Sunday 1h 35m, Monday 0m, Tuesday 0m, Wednesday 30m, Thursday 0m, Friday 0m, Saturday 0m. ' +
        'Daily pace for 12h: 1h 43m.',
    );
    expect(chart.querySelectorAll('path')).toHaveLength(7);
    expect(within(chart).getByText('Daily pace for 12h')).toBeDefined();
  });

  it('greets a new user with empty states', async () => {
    await renderProgress();
    expect(await screen.findByText('Finish a focus round to start your week.')).toBeDefined();
    expect(screen.getByText('Join a room to log your first one.')).toBeDefined();
    expect(screen.getByText('Finish a focus round to see it here.')).toBeDefined();
    expect(await screen.findByText('No sessions yet')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Find a room' }).getAttribute('href')).toBe('/home#live');
  });

  it('offers a retry when your progress can’t load', async () => {
    summary = 'error';
    await renderProgress();
    expect(await screen.findByText('Couldn’t load your progress')).toBeDefined();
    summary = makeSummary({ streak: { current: 2, longest: 2, studiedToday: true } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(await screen.findByText('Your longest streak is 2 days')).toBeDefined();
  });

  describe('Session history', () => {
    it('lists your sessions, with ones in progress marked', async () => {
      pages = {
        '': onePage([
          makeSession({
            roomName: 'Late-night exam grind',
            endedAt: null,
            focusedMins: 50,
            roundsCompleted: 1,
          }),
          makeSession({
            roomName: 'Quiet reading room',
            roundsTotal: null,
            roundsCompleted: 2,
            goalsTotal: 0,
          }),
        ]),
      };
      await renderProgress();
      await within(history()).findByText('Late-night exam grind');
      const rows = within(history()).getAllByRole('row');
      const cells = (row: HTMLElement) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent);
      expect(
        within(rows[0]!)
          .getAllByRole('columnheader')
          .map((th) => th.textContent),
      ).toEqual(['Date', 'Room', 'Focus', 'Rounds', 'Goals done', 'People']);
      expect(cells(rows[1]!)).toEqual([
        'Thu 29 OctIn progress',
        'Late-night exam grind',
        '50m',
        '1 of 4',
        '2 of 4',
        '12',
      ]);
      expect(cells(rows[2]!)).toEqual(['Thu 29 Oct', 'Quiet reading room', '1h 40m', '2', 'None set', '12']);
      // A single page needs no pager.
      expect(screen.queryByRole('navigation', { name: 'Session history pages' })).toBeNull();
    });

    it('pages older and newer with the keyboard-reachable pager', async () => {
      pages = {
        '': onePage([makeSession({ roomName: 'Newest room' })], 'c2'),
        c2: onePage([makeSession({ roomName: 'Oldest room' })]),
      };
      await renderProgress();
      expect(await within(history()).findByText('Newest room')).toBeDefined();
      const pager = screen.getByRole('navigation', { name: 'Session history pages' });
      const newer = within(pager).getByRole('button', { name: 'Newer' }) as HTMLButtonElement;
      const older = within(pager).getByRole('button', { name: 'Older' }) as HTMLButtonElement;
      expect(newer.disabled).toBe(true);

      fireEvent.click(older);
      expect(await within(history()).findByText('Oldest room')).toBeDefined();
      expect(within(pager).getByText('Page 2')).toBeDefined();
      await waitFor(() => expect(older.disabled).toBe(true));
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Session history table' }));
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('cursor=c2'))).toBe(true);

      fireEvent.click(newer);
      expect(await within(history()).findByText('Newest room')).toBeDefined();
      expect(within(pager).getByText('Page 1')).toBeDefined();
    });

    it('offers a retry when your history can’t load', async () => {
      pages = 'error';
      await renderProgress();
      expect(await screen.findByText('Couldn’t load your sessions')).toBeDefined();
      pages = { '': onePage([makeSession({ roomName: 'Back again' })]) };
      fireEvent.click(screen.getAllByRole('button', { name: 'Try again' }).at(-1)!);
      expect(await screen.findByText('Back again')).toBeDefined();
    });
  });
});
