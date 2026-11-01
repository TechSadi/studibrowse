import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MySession,
  ProgressSummaryResponse,
  PublicUser,
  RoomDetail,
  RoomSummary,
} from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeSession, makeSummary } from '../../test/progressFixtures';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

let user: PublicUser;
let liveRooms: RoomSummary[];
let roomsFail: boolean;
let createdBodies: unknown[];
let summary: ProgressSummaryResponse;
let mySessions: MySession[] | 'error';

const timerSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
  totalRounds: 4,
  autoStart: true,
};

function makeRoom(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 'r1',
    name: 'Finals week focus',
    subject: 'Maths',
    host: { id: 'u2', name: 'Maya Kapoor', username: 'maya', avatarColor: 'gold' },
    isPublic: true,
    maxSize: 20,
    memberCount: 14,
    timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
    timerSettings,
    hostFollowed: false,
    ...overrides,
  };
}

function createdRoom(body: { name: string; isPublic: boolean }): RoomDetail {
  const { hostFollowed: _, ...summary } = makeRoom({ id: 'new-room', name: body.name, memberCount: 0 });
  return {
    ...summary,
    isPublic: body.isPublic,
    description: '',
    goals: [],
    inviteCode: 'aB3xK9_q-2',
    isHost: true,
    totalSessions: 0,
    totalFocusMins: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
  };
}

function fakeFetch(input: string, init: RequestInit = {}) {
  const route = `${init.method ?? 'GET'} ${input.split('?')[0]}`;
  if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
  if (route === 'GET /api/rooms/public') {
    if (roomsFail) {
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
        { status: 500 },
      );
    }
    return Response.json({ rooms: liveRooms, nextPage: null });
  }
  if (route === 'GET /api/progress/summary') return Response.json(summary);
  if (route === 'GET /api/sessions/mine') {
    if (mySessions === 'error') {
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
        { status: 500 },
      );
    }
    return Response.json({ sessions: mySessions, nextCursor: null });
  }
  if (route === 'POST /api/rooms') {
    const body = JSON.parse(String(init.body)) as { name: string; isPublic: boolean };
    createdBodies.push(body);
    return Response.json({ room: createdRoom(body) }, { status: 201 });
  }
  throw new Error(`Unexpected request: ${route}`);
}

async function renderHome(path = '/home') {
  const router = renderRoutes(path);
  await screen.findByRole('heading', { level: 1, name: /Alex/ });
  return router;
}

beforeEach(() => {
  user = makeUser({ weeklyGoalMins: 720 });
  liveRooms = [];
  roomsFail = false;
  createdBodies = [];
  summary = makeSummary();
  mySessions = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setAccessToken(null);
});

describe('HomePage', () => {
  it('greets you by first name with today’s date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 19, 0));
    renderRoutes('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Good evening, Alex' })).toBeDefined();
    expect(screen.getByText('Friday, October 30')).toBeDefined();
  });

  it('shows empty states instead of rooms and sessions it doesn’t have', async () => {
    await renderHome();
    expect(screen.getByText('No rooms live right now')).toBeDefined();
    expect(await screen.findByText('No live rooms right now')).toBeDefined();
    expect(await screen.findByText('No sessions yet')).toBeDefined();
    const weekly = screen.getByRole('region', { name: 'Your focus this week' });
    expect(within(weekly).getByText('0m')).toBeDefined();
    expect(within(weekly).getByRole('img', { name: 'No focus time logged this week yet' })).toBeDefined();
  });

  it('measures this week against your weekly goal', async () => {
    await renderHome();
    const weekly = screen.getByRole('region', { name: 'Your focus this week' });
    expect(within(weekly).getByText('of your 12 hour weekly goal')).toBeDefined();
    expect(
      within(weekly).getByRole('progressbar', { name: 'Weekly goal' }).getAttribute('aria-valuenow'),
    ).toBe('0');
  });

  it('shows this week’s focus by day and how it compares with last week', async () => {
    summary = makeSummary({ minsByDay: [95, 140, 75, 210, 0, 0, 0], lastWeek: { focusMins: 440 } });
    await renderHome();
    const weekly = screen.getByRole('region', { name: 'Your focus this week' });
    expect(await within(weekly).findByText('8h 40m')).toBeDefined();
    expect(within(weekly).getByText('+18% vs last week')).toBeDefined();
    expect(within(weekly).getByText('72%')).toBeDefined();
    expect(
      within(weekly).getByRole('progressbar', { name: 'Weekly goal' }).getAttribute('aria-valuenow'),
    ).toBe('72');
    expect(within(weekly).getByRole('img').getAttribute('aria-label')).toBe(
      'Focus time this week: Sunday 1h 35m, Monday 2h 20m, Tuesday 1h 15m, Wednesday 3h 30m, Thursday 0m, Friday 0m, Saturday 0m',
    );
    // Today's bar carries its time.
    expect(within(weekly).getByText('3h 30m')).toBeDefined();
  });

  it('lists your recent sessions, in progress ones first', async () => {
    mySessions = [
      makeSession({ roomName: 'Late-night exam grind', endedAt: null, focusedMins: 50, peopleCount: 1 }),
      makeSession({ roomName: 'Quiet reading room', focusedMins: 75, peopleCount: 16 }),
    ];
    await renderHome();
    const recent = screen.getByRole('region', { name: 'Your recent sessions' });
    const rows = await within(recent).findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Late-night exam grindIn progress · just youFocused 50m',
      'Quiet reading roomThu 29 Oct · with 16 peopleFocused 1h 15m',
    ]);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/sessions/mine?limit=3')).toBe(true);
  });

  it('offers a retry when recent sessions can’t load', async () => {
    mySessions = 'error';
    await renderHome();
    const recent = screen.getByRole('region', { name: 'Your recent sessions' });
    expect(await within(recent).findByText('Couldn’t load your sessions')).toBeDefined();
    mySessions = [makeSession()];
    fireEvent.click(within(recent).getByRole('button', { name: 'Try again' }));
    expect(await within(recent).findByText('Finals week focus')).toBeDefined();
  });

  it('opens Create a room through ?create=1', async () => {
    const router = await renderHome();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create a room' })[0]!);
    await waitFor(() => expect(router.state.location.search).toBe('?create=1'));
  });

  describe('join by link', () => {
    const input = () => screen.getByRole('textbox', { name: 'Invite link or code' });
    const join = () => fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    it('opens the invite from a pasted link', async () => {
      const router = await renderHome();
      fireEvent.change(input(), { target: { value: 'https://studibrowse.app/r/aB3xK9_q-2' } });
      join();
      await waitFor(() => expect(router.state.location.pathname).toBe('/r/aB3xK9_q-2'));
    });

    it('explains what’s wrong with an empty or invalid entry', async () => {
      await renderHome();
      join();
      expect((await screen.findByRole('alert')).textContent).toBe('Paste an invite link or code first.');

      fireEvent.change(input(), { target: { value: 'join my room please' } });
      expect(screen.queryByRole('alert')).toBeNull();
      join();
      expect((await screen.findByRole('alert')).textContent).toMatch(/doesn’t look like an invite/);
      expect(input().getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('filters rooms with the chips as a radio group', async () => {
    await renderHome();
    const group = screen.getByRole('radiogroup', { name: 'Filter rooms' });
    const all = within(group).getByRole('radio', { name: 'All rooms' });
    expect(all.getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(all, { key: 'ArrowRight' });
    const open = within(group).getByRole('radio', { name: 'Has space' });
    expect(open.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(open);
  });

  it('keeps the top-bar search and the rooms search in sync through ?q=', async () => {
    const router = await renderHome('/home?q=chem');
    const top = screen.getByRole('searchbox', { name: 'Search rooms' });
    const rooms = screen.getByRole('searchbox', { name: 'Search rooms or subjects' });
    expect((top as HTMLInputElement).value).toBe('chem');
    expect(await screen.findByText('No live rooms match “chem”')).toBeDefined();

    fireEvent.change(rooms, { target: { value: 'law' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=law'));
    expect((top as HTMLInputElement).value).toBe('law');
  });

  it('focuses the top-bar search when you press /', async () => {
    await renderHome();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search rooms' }));
  });

  it('searches from another page by going to Home', async () => {
    const router = renderRoutes('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    const top = screen.getByRole('searchbox', { name: 'Search rooms' });
    fireEvent.change(top, { target: { value: 'physics' } });
    fireEvent.submit(top);
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(router.state.location.search).toBe('?q=physics');
  });

  describe('Rooms worth joining', () => {
    it('shows live rooms as cards', async () => {
      liveRooms = [
        makeRoom({ hostFollowed: true }),
        makeRoom({ id: 'r2', name: 'Quiet reading', subject: '', memberCount: 4, maxSize: 4 }),
      ];
      await renderHome();
      const card = await screen.findByRole('article', { name: 'Finals week focus' });
      expect(within(card).getByText('Live')).toBeDefined();
      expect(within(card).getByLabelText('14 of 20 people').textContent).toBe('14/20');
      expect(within(card).getByText('You follow Maya')).toBeDefined();
      expect(within(card).getByText('Waiting to start')).toBeDefined();
      expect(within(card).getByRole('link', { name: 'Join Finals week focus' }).getAttribute('href')).toBe(
        '/room/r1',
      );

      const full = screen.getByRole('article', { name: 'Quiet reading' });
      const fullButton = within(full).getByRole('button', { name: 'Room is full' }) as HTMLButtonElement;
      expect(fullButton.disabled).toBe(true);
    });

    it('filters by a card’s subject through ?subject=', async () => {
      liveRooms = [makeRoom()];
      const router = await renderHome();
      fireEvent.click(await screen.findByRole('button', { name: 'Show Maths rooms' }));
      await waitFor(() => expect(router.state.location.search).toBe('?subject=Maths'));
      const calls = vi.mocked(fetch).mock.calls;
      await waitFor(() => expect(calls.some(([url]) => String(url).includes('subject=Maths'))).toBe(true));
      fireEvent.click(screen.getByRole('button', { name: 'Clear subject filter: Maths' }));
      await waitFor(() => expect(router.state.location.search).toBe(''));
    });

    it('offers a retry when the rooms can’t load', async () => {
      roomsFail = true;
      await renderHome();
      expect(await screen.findByText('Couldn’t load live rooms')).toBeDefined();
      roomsFail = false;
      liveRooms = [makeRoom()];
      fireEvent.click(screen.getByRole('button', { name: 'Reload rooms' }));
      expect(await screen.findByRole('article', { name: 'Finals week focus' })).toBeDefined();
    });
  });

  describe('Create a room', () => {
    const dialog = () => screen.getByRole('dialog', { name: 'Create a study room' });

    it('asks for a name before creating', async () => {
      await renderHome('/home?create=1');
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Create and open' }));
      expect(
        await within(dialog()).findByText('Give your room a name so people know what they’re joining.'),
      ).toBeDefined();
      expect(createdBodies).toEqual([]);
    });

    it('starts from your timer defaults and keeps steppers in range', async () => {
      user = makeUser({ timerDefaults: { ...user.timerDefaults, focusMins: 90 } });
      await renderHome('/home?create=1');
      const more = within(dialog()).getByRole('button', { name: 'More focus' }) as HTMLButtonElement;
      expect(more.disabled).toBe(true);
      expect(within(dialog()).getByText(/ends around/)).toBeDefined();
    });

    it('stops adding goals at 10', async () => {
      await renderHome('/home?create=1');
      const goal = within(dialog()).getByRole('textbox', { name: /Room goals/ }) as HTMLInputElement;
      // The dialog starts with one suggested goal.
      for (let i = 2; i <= 10; i++) {
        fireEvent.change(goal, { target: { value: `Goal ${i}` } });
        fireEvent.keyDown(goal, { key: 'Enter' });
      }
      expect(within(dialog()).getAllByRole('button', { name: /^Remove goal/ })).toHaveLength(10);
      expect(goal.disabled).toBe(true);
    });

    it('creates the room and opens it', async () => {
      const router = await renderHome('/home?create=1');
      fireEvent.change(within(dialog()).getByLabelText('Room name'), {
        target: { value: '  Torts revision ' },
      });
      fireEvent.click(within(dialog()).getByRole('radio', { name: /Private/ }));
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Create and open' }));

      await waitFor(() => expect(router.state.location.pathname).toBe('/room/new-room'));
      expect(createdBodies).toEqual([
        {
          name: 'Torts revision',
          subject: '',
          description: '',
          isPublic: false,
          maxSize: 10,
          timerSettings,
          goals: ['Set your own goal before round 1'],
        },
      ]);
      // The focus room joins over the socket, which isn't connected in this test.
      expect(await screen.findByRole('heading', { level: 1, name: 'Joining the room' })).toBeDefined();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes with Escape', async () => {
      const router = await renderHome('/home?create=1');
      fireEvent.keyDown(within(dialog()).getByLabelText('Room name'), { key: 'Escape' });
      await waitFor(() => expect(router.state.location.search).toBe(''));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
