import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowListResponse, PublicUser, RoomSummary, UserProfile } from '@studibrowse/shared';
import { setAccessToken } from '../../lib/api';
import { makeSummary } from '../../test/progressFixtures';
import { makeUser, renderRoutes } from '../../test/renderRoutes';

const hosting: RoomSummary = {
  id: 'r1',
  name: 'Late-night exam grind',
  subject: 'Pharmacology',
  host: { id: 'maya', name: 'Maya Kapoor', username: 'mayak', avatarColor: 'gold' },
  isPublic: true,
  maxSize: 20,
  memberCount: 14,
  isLive: true,
  timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
  timerSettings: {
    focusMins: 25,
    shortBreakMins: 5,
    longBreakMins: 15,
    roundsBeforeLong: 4,
    totalRounds: 4,
    autoStart: false,
  },
  createdAt: '2026-11-02T18:00:00.000Z',
  hostFollowed: false,
};

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'maya',
    name: 'Maya Kapoor',
    username: 'mayak',
    avatarColor: 'gold',
    studying: 'Pharmacy, year 3',
    subjects: ['Pharmacology', 'Exam prep'],
    joinedAt: '2026-03-14T10:00:00.000Z',
    followerCount: 318,
    followingCount: 64,
    isFollowing: false,
    isMe: false,
    stats: { focusMinsThisMonth: 42 * 60, streak: 19, roomsHosted: 27 },
    hostingNow: null,
    recentRooms: [
      {
        roomId: 'r9',
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

let user: PublicUser;
let profile: UserProfile | 'notFound' | 'error';
let followers: FollowListResponse[];
const calls: string[] = [];

function fakeFetch(input: string, init: RequestInit = {}) {
  const [path, query = ''] = input.split('?');
  const route = `${init.method ?? 'GET'} ${path}`;
  calls.push(`${route}${query ? `?${query}` : ''}`);
  if (route === 'POST /api/auth/refresh') return Response.json({ accessToken: 'token', user });
  if (route === 'GET /api/users/me/following') return Response.json({ users: [] });
  if (route === 'GET /api/progress/summary') return Response.json(makeSummary());
  if (route === 'GET /api/users/mayak') {
    if (profile === 'notFound') {
      return Response.json({ error: { code: 'USER_NOT_FOUND', message: 'Not found.' } }, { status: 404 });
    }
    // A 4xx isn't retried, so the error shows straight away.
    if (profile === 'error') {
      return Response.json({ error: { code: 'RATE_LIMITED', message: 'Too many tries.' } }, { status: 429 });
    }
    return Response.json({ profile });
  }
  if (route === 'GET /api/users/mayak/followers') {
    const page = query.includes('cursor=') ? followers[1] : followers[0];
    return Response.json(page);
  }
  if (route === 'POST /api/users/maya/follow') {
    user = { ...user, following: [...user.following, 'maya'] };
    return Response.json({ user });
  }
  if (route === 'DELETE /api/users/maya/follow') {
    user = { ...user, following: user.following.filter((id) => id !== 'maya') };
    return Response.json({ user });
  }
  throw new Error(`Unexpected request: ${route}`);
}

const person = (id: string, name: string) => ({
  id,
  name,
  username: id,
  avatarColor: 'blue' as const,
  studying: '',
  isFollowing: false,
});

beforeEach(() => {
  user = makeUser();
  profile = makeProfile();
  followers = [
    { users: [person('sofia', 'Sofia Reyes')], nextCursor: 'next' },
    { users: [person('arjun', 'Arjun Thomas')], nextCursor: null },
  ];
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('ProfilePage', () => {
  it('shows who they are, their stats, recent rooms, about and followers', async () => {
    renderRoutes('/u/mayak');
    // The first render of a test file loads every route's code, which can be slow under a full parallel run.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Maya Kapoor' }, { timeout: 10_000 }),
    ).toBeDefined();
    expect(screen.getByText('@mayak · Pharmacy, year 3 · Joined March 2026')).toBeDefined();
    expect(screen.getByText('42h')).toBeDefined();
    expect(screen.getByText('day streak')).toBeDefined();
    expect(screen.getByText('27')).toBeDefined();
    expect(screen.getByText('Pharmacology flashcards')).toBeDefined();
    expect(screen.getByText('Rooms Maya hosted or joined')).toBeDefined();
    expect(within(screen.getByRole('list', { name: 'Subjects' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /318 followers/ })).toBeDefined();
    expect(screen.getByText('You and Maya studied together in 6 rooms.')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Hosting now' })).toBeNull();
  }, 15_000);

  it('shows the room they are hosting with a Join link', async () => {
    profile = makeProfile({ hostingNow: hosting });
    renderRoutes('/u/mayak');
    const card = await screen.findByRole('region', { name: 'Hosting now' });
    expect(within(card).getByText('Hosting Late-night exam grind')).toBeDefined();
    expect(
      within(card).getByText('14 of 20 studying · waiting to start · 4 × 25 min focus rounds'),
    ).toBeDefined();
    expect(within(card).getByRole('link', { name: 'Join Late-night exam grind' }).getAttribute('href')).toBe(
      '/room/r1',
    );
  });

  it('leaves the stats out when their privacy settings hide them', async () => {
    profile = makeProfile({ stats: null, studying: '' });
    renderRoutes('/u/mayak');
    await screen.findByRole('heading', { level: 1, name: 'Maya Kapoor' });
    expect(screen.queryByText('day streak')).toBeNull();
    expect(screen.getByText('@mayak · Joined March 2026')).toBeDefined();
  });

  it('follows and unfollows', async () => {
    renderRoutes('/u/mayak');
    const follow = await screen.findByRole('button', { name: 'Follow Maya Kapoor' });
    expect(follow.textContent).toBe('Follow');

    fireEvent.click(follow);
    await waitFor(() => expect(follow.textContent).toBe('Following'));
    expect(calls).toContain('POST /api/users/maya/follow');
    expect(await screen.findByText('You’ll hear when they open a room')).toBeDefined();

    fireEvent.click(follow);
    await waitFor(() => expect(follow.textContent).toBe('Follow'));
    expect(calls).toContain('DELETE /api/users/maya/follow');
  });

  it('copies the profile link when the device has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    renderRoutes('/u/mayak');
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Profile link copied')).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/u/mayak`);
  });

  it('offers Edit profile instead of Follow on your own profile', async () => {
    profile = makeProfile({ isMe: true, studiedTogether: null });
    renderRoutes('/u/mayak');
    expect(await screen.findByRole('link', { name: 'Edit profile' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Follow/ })).toBeNull();
    expect(screen.queryByText(/studied together/)).toBeNull();
  });

  it('says when nobody has that username', async () => {
    profile = 'notFound';
    renderRoutes('/u/mayak');
    expect(await screen.findByText('We couldn’t find @mayak')).toBeDefined();
  });

  it('shows an error with a retry', async () => {
    profile = 'error';
    renderRoutes('/u/mayak');
    expect(await screen.findByText('Couldn’t load this profile')).toBeDefined();
    profile = makeProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Maya Kapoor' })).toBeDefined();
  });

  it('lists followers in a dialog, a page at a time', async () => {
    renderRoutes('/u/mayak');
    fireEvent.click(await screen.findByRole('button', { name: /318 followers/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Followers' });
    expect(await within(dialog).findByText('Sofia Reyes')).toBeDefined();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Show more' }));
    expect(await within(dialog).findByText('Arjun Thomas')).toBeDefined();
    expect(within(dialog).queryByRole('button', { name: 'Show more' })).toBeNull();
    // The button went with the last page, so focus moved to the first new person, still inside the dialog.
    expect(document.activeElement).toBe(within(dialog).getByRole('link', { name: /Arjun Thomas/ }));
    expect(calls).toContain('GET /api/users/mayak/followers?cursor=next');
    expect(
      within(dialog)
        .getByRole('link', { name: /Sofia Reyes/ })
        .getAttribute('href'),
    ).toBe('/u/sofia');
  });
});
