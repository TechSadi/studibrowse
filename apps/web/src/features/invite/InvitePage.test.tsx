import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreview, InvitePreviewResponse, PublicUser } from '@studibrowse/shared';
import type * as ApiModule from '../../lib/api';
import { ApiError } from '../../lib/api';
import { makeUser } from '../../test/renderRoutes';
import { InvitePage } from './InvitePage';

const auth = vi.hoisted(() => ({
  state: { status: 'signedOut', user: null } as { status: string; user: PublicUser | null },
  setUser: vi.fn(),
}));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ invite: vi.fn(), follow: vi.fn(), unfollow: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    roomsApi: { ...actual.roomsApi, invite: api.invite },
    usersApi: { ...actual.usersApi, follow: api.follow, unfollow: api.unfollow },
  };
});

const CODE = 'aB3xK9_q-2';
const NOW = Date.parse('2026-11-01T10:24:00Z');
const host = { id: 'maya', name: 'Maya Kapoor', username: 'maya', avatarColor: 'gold' as const };

function openRoom(changes: Partial<InvitePreview> = {}): InvitePreviewResponse {
  return {
    status: 'open',
    room: {
      id: 'room1',
      name: 'Late-night exam grind',
      subject: 'Mixed subjects',
      description: 'Four focus rounds tonight.',
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
        endsAt: new Date(NOW + 18 * 60_000 + 12_000).toISOString(),
        pausedRemaining: null,
      },
      timerSettings: {
        focusMins: 25,
        shortBreakMins: 5,
        longBreakMins: 15,
        roundsBeforeLong: 4,
        totalRounds: 4,
        autoStart: true,
      },
      goals: [
        { text: 'Everyone finishes one past paper', done: false },
        { text: 'No phones during focus rounds', done: false },
      ],
      ...changes,
    },
  };
}

const closedRoom: InvitePreviewResponse = {
  status: 'closed',
  room: { name: 'Organic chem, together', host: { ...host, name: 'Jordan Lee' }, roomsPerWeek: 3 },
};

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderInvite(code = CODE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/r/${code}`]}>
        <Routes>
          <Route path="/r/:inviteCode" element={<InvitePage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  auth.state = { status: 'signedOut', user: null };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('InvitePage, signed out', () => {
  it('previews the room: host, live status, people, timer and goals', async () => {
    api.invite.mockResolvedValue(openRoom());
    renderInvite();

    expect(await screen.findByRole('heading', { name: 'Late-night exam grind' })).toBeTruthy();
    expect(api.invite).toHaveBeenCalledWith(CODE);
    expect(screen.getByText(/invited you to study together/).textContent).toContain('Maya Kapoor');
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('Mixed subjects')).toBeTruthy();
    expect(screen.getByLabelText('14 of 20 people').textContent).toContain('14/20');
    expect(screen.getByText('Four focus rounds tonight.')).toBeTruthy();
    expect(screen.getByText('Right now').nextSibling?.textContent).toContain('Focus');
    expect(screen.getByText('Time left').nextSibling?.textContent).toContain('18:12');
    expect(screen.getByText('Round').nextSibling?.textContent).toContain('3 of 4');
    const goals = screen.getByRole('list', { name: 'Room goals' });
    expect(
      within(goals)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Everyone finishes one past paper', 'No phones during focus rounds']);
    expect(screen.getByRole('img', { name: '14 studying now' }).textContent).toContain('+10');
    expect(screen.getByText(/^Join during the break at/)).toBeTruthy();
    expect(document.title).toBe('Late-night exam grind · StudiBrowse');
  });

  it('sends Sign up and Log in back to the invite afterwards', async () => {
    api.invite.mockResolvedValue(openRoom());
    renderInvite();

    const next = `next=${encodeURIComponent(`/r/${CODE}`)}`;
    expect((await screen.findByRole('link', { name: 'Sign up to join' })).getAttribute('href')).toBe(
      `/signup?${next}`,
    );
    expect(screen.getByRole('link', { name: 'I already have an account' }).getAttribute('href')).toBe(
      `/login?${next}`,
    );
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(`/login?${next}`);
  });

  it('leaves out the description, goals and people when there are none', async () => {
    api.invite.mockResolvedValue(
      openRoom({
        description: '',
        goals: [],
        memberCount: 0,
        members: [],
        timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
      }),
    );
    renderInvite();

    await screen.findByRole('heading', { name: 'Late-night exam grind' });
    expect(screen.queryByText('Room goals')).toBeNull();
    expect(screen.queryByRole('img', { name: /studying now/ })).toBeNull();
    expect(screen.getByText('Right now').nextSibling?.textContent).toContain('Not started');
  });

  it('shows a loading card first', () => {
    api.invite.mockReturnValue(new Promise(() => undefined));
    renderInvite();
    expect(screen.getByRole('status', { name: 'Loading the invite' })).toBeTruthy();
  });

  it('shows not found for an unknown code, and for a malformed one without asking the server', async () => {
    api.invite.mockRejectedValue(new ApiError(404, 'ROOM_NOT_FOUND', 'Not found'));
    renderInvite();
    expect(await screen.findByRole('heading', { name: 'We couldn’t find that room' })).toBeTruthy();

    cleanup();
    api.invite.mockClear();
    renderInvite('nope');
    expect(screen.getByRole('heading', { name: 'We couldn’t find that room' })).toBeTruthy();
    expect(api.invite).not.toHaveBeenCalled();
  });

  it('offers a retry when the preview fails to load', async () => {
    api.invite.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'Too many tries. Wait a minute.'));
    api.invite.mockResolvedValueOnce(openRoom());
    renderInvite();

    expect(await screen.findByText('Too many tries. Wait a minute.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Late-night exam grind' })).toBeTruthy();
  });
});

describe('InvitePage, signed in', () => {
  beforeEach(() => {
    auth.state = { status: 'signedIn', user: makeUser({ id: 'me' }) };
  });

  it('goes straight into the room with the invite code', async () => {
    api.invite.mockResolvedValue(openRoom());
    renderInvite();
    expect((await screen.findByTestId('where')).textContent).toContain(`/room/room1?invite=${CODE}`);
  });
});

describe('InvitePage, room closed', () => {
  it('explains the room ended and links to live rooms or a new room', async () => {
    api.invite.mockResolvedValue(closedRoom);
    renderInvite();

    expect(await screen.findByRole('heading', { name: 'This room has closed' })).toBeTruthy();
    expect(screen.getByText(/“Organic chem, together” ended when everyone left/)).toBeTruthy();
    expect(screen.getByText('Jordan Lee')).toBeTruthy();
    expect(screen.getByText('Hosts about 3 rooms a week')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See rooms that are live now' }).getAttribute('href')).toBe(
      '/home',
    );
    expect(screen.getByRole('link', { name: 'Open your own room' }).getAttribute('href')).toBe(
      '/home?create=1',
    );
    expect(document.title).toBe('This room has closed · StudiBrowse');
  });

  it('sends a signed-out visitor to sign up to follow the host', async () => {
    api.invite.mockResolvedValue(closedRoom);
    renderInvite();

    fireEvent.click(await screen.findByRole('button', { name: 'Follow Jordan Lee' }));
    expect(api.follow).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toContain(
      `/signup?next=${encodeURIComponent(`/r/${CODE}`)}`,
    );
  });

  it('follows the host when signed in', async () => {
    auth.state = { status: 'signedIn', user: makeUser({ id: 'me' }) };
    const updated = makeUser({ id: 'me', following: ['maya'] });
    api.follow.mockResolvedValue({ user: updated });
    api.invite.mockResolvedValue(closedRoom);
    renderInvite();

    const follow = await screen.findByRole('button', { name: 'Follow Jordan Lee' });
    expect(follow.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(follow);
    await waitFor(() => expect(auth.setUser).toHaveBeenCalledWith(updated));
    expect(api.follow).toHaveBeenCalledWith('maya');
  });

  it('shows Following for a host you already follow, and unfollows', async () => {
    auth.state = { status: 'signedIn', user: makeUser({ id: 'me', following: ['maya'] }) };
    api.unfollow.mockResolvedValue({ user: makeUser({ id: 'me' }) });
    api.invite.mockResolvedValue(closedRoom);
    renderInvite();

    const button = await screen.findByRole('button', { name: 'Follow Jordan Lee' });
    expect(button.textContent).toContain('Following');
    fireEvent.click(button);
    await waitFor(() => expect(api.unfollow).toHaveBeenCalledWith('maya'));
  });

  it('hides Follow when you were the host', async () => {
    auth.state = { status: 'signedIn', user: makeUser({ id: 'maya' }) };
    api.invite.mockResolvedValue(closedRoom);
    renderInvite();

    await screen.findByRole('heading', { name: 'This room has closed' });
    expect(screen.queryByRole('button', { name: /Follow/ })).toBeNull();
  });
});
