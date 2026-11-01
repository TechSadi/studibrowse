import type { Page, Route } from '@playwright/test';
import type {
  ApiErrorBody,
  AuthResponse,
  FollowedUser,
  InvitePreviewResponse,
  MySession,
  ProgressSummaryResponse,
  PublicUser,
  RoomDetail,
  RoomSummary,
  SuggestedUser,
} from '@studibrowse/shared';

/**
 * An in-memory stand-in for the auth API, so the e2e tests run against the Vite dev server alone.
 * `sessionUserId` plays the part of the httpOnly refresh cookie: it survives page reloads within a test.
 */
export interface MockAccount {
  user: PublicUser;
  password: string;
}

export const VALID_RESET_TOKEN = 'valid-reset-token';

export function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: overrides.username ?? 'user-1',
    name: 'Alex Smith',
    username: 'alexsmith',
    email: 'alex@example.com',
    avatarColor: 'green',
    studying: '',
    subjects: [],
    weeklyGoalMins: 600,
    timerDefaults: {
      focusMins: 25,
      shortBreakMins: 5,
      longBreakMins: 15,
      roundsBeforeLong: 4,
      totalRounds: 4,
    },
    streak: { current: 0, longest: 0 },
    lastStudiedAt: null,
    timeZone: 'UTC',
    following: [],
    notificationPrefs: { roomOpened: true, roomFull: true, memberJoined: true, roundEnded: true },
    onboardedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

/** This week (Sunday to Saturday, UTC) with nothing logged, as a new user's summary. */
export function makeProgress(overrides: Partial<ProgressSummaryResponse> = {}): ProgressSummaryResponse {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sunday = today - now.getUTCDay() * 86_400_000;
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(sunday + index * 86_400_000).toISOString().slice(0, 10),
    focusMins: 0,
  }));
  return {
    range: 'week',
    today: new Date(today).toISOString().slice(0, 10),
    days,
    week: { focusMins: 0, goalMins: 600, sessions: 0, people: 0, rooms: 0 },
    lastWeek: { focusMins: 0 },
    streak: { current: 0, longest: 0, studiedToday: false },
    ...overrides,
  };
}

export function makeMySession(overrides: Partial<MySession> = {}): MySession {
  return {
    id: `session-${Math.random().toString(36).slice(2, 8)}`,
    roomName: 'Finals week focus',
    startedAt: '2026-10-29T10:00:00.000Z',
    endedAt: '2026-10-29T11:40:00.000Z',
    focusedMins: 100,
    roundsCompleted: 4,
    roundsTotal: 4,
    goalsDone: 2,
    goalsTotal: 4,
    peopleCount: 12,
    ...overrides,
  };
}

/** A room in the mock: the detail the host sees. Strangers get the same shape (the mock doesn't hide codes). */
export function makeRoom(host: PublicUser, overrides: Partial<RoomDetail> = {}): RoomDetail {
  return {
    id: `room-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Finals week focus',
    subject: 'Maths',
    description: '',
    host: { id: host.id, name: host.name, username: host.username, avatarColor: host.avatarColor },
    isPublic: true,
    maxSize: 20,
    memberCount: 0,
    isLive: (overrides.memberCount ?? 0) > 0,
    timer: { phase: 'idle', round: 1, endsAt: null, pausedRemaining: null },
    timerSettings: { ...host.timerDefaults, autoStart: true },
    goals: [],
    inviteCode: 'aB3xK9_q-2',
    isHost: false,
    totalSessions: 0,
    totalFocusMins: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export class MockApi {
  accounts: MockAccount[] = [];
  /** Newest first, like the server's list. */
  rooms: RoomDetail[] = [];
  sessionUserId: string | null = null;
  /** Invite previews by code: GET /api/rooms/invite/:code answers 404 for any other code. */
  invites: Record<string, InvitePreviewResponse> = {};
  /** Request bodies by endpoint, e.g. calls.login[0]. */
  calls: Record<string, unknown[]> = {};
  /** GET /api/progress/summary for whoever is signed in. */
  progress: ProgressSummaryResponse = makeProgress();
  /** GET /api/sessions/mine, newest first. The cursor is the index of the next session. */
  mySessions: MySession[] = [];

  addAccount(user: PublicUser, password: string) {
    this.accounts.push({ user, password });
    return user;
  }

  signIn(user: PublicUser) {
    this.sessionUserId = user.id;
  }

  private session(user: PublicUser, status = 200) {
    this.sessionUserId = user.id;
    const body: AuthResponse = { accessToken: `token-${user.id}`, user };
    return { status, json: body };
  }

  private currentAccount(): MockAccount | undefined {
    return this.accounts.find((a) => a.user.id === this.sessionUserId);
  }

  private updateCurrentUser(update: (user: PublicUser) => PublicUser) {
    const account = this.currentAccount();
    if (!account) return error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    account.user = update(account.user);
    return { status: 200, json: { user: account.user } };
  }

  private record(name: string, body: unknown) {
    (this.calls[name] ??= []).push(body);
  }

  handle(method: string, url: URL, body: Record<string, unknown>): { status: number; json?: unknown } {
    const path = `${method} ${url.pathname}`;
    switch (path) {
      case 'POST /api/auth/refresh': {
        const account = this.accounts.find((a) => a.user.id === this.sessionUserId);
        return account
          ? this.session(account.user)
          : error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
      }
      case 'POST /api/auth/signup': {
        this.record('signup', body);
        const email = String(body.email).trim().toLowerCase();
        const username = String(body.username).trim().toLowerCase();
        if (this.accounts.some((a) => a.user.email === email)) {
          return error(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
        }
        if (this.accounts.some((a) => a.user.username === username)) {
          return error(409, 'USERNAME_TAKEN', `@${username} is taken.`);
        }
        const user = this.addAccount(
          makeUser({ id: `id-${username}`, name: String(body.name), username, email, onboardedAt: null }),
          String(body.password),
        );
        return this.session(user, 201);
      }
      case 'POST /api/auth/login': {
        this.record('login', body);
        const identifier = String(body.identifier).trim().toLowerCase();
        const account = this.accounts.find(
          (a) =>
            (a.user.email === identifier || a.user.username === identifier) && a.password === body.password,
        );
        return account
          ? this.session(account.user)
          : error(401, 'INVALID_CREDENTIALS', 'That email or username and password don’t match.');
      }
      case 'POST /api/auth/logout':
        this.sessionUserId = null;
        return { status: 204 };
      case 'POST /api/auth/google':
        return error(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not available right now.');
      case 'POST /api/auth/forgot':
        this.record('forgot', body);
        return { status: 200, json: { ok: true } };
      case 'POST /api/auth/reset': {
        this.record('reset', body);
        if (body.token !== VALID_RESET_TOKEN) {
          return error(
            400,
            'RESET_TOKEN_INVALID',
            'This reset link is invalid or has expired. Request a new one.',
          );
        }
        for (const account of this.accounts) account.password = String(body.password);
        this.sessionUserId = null;
        return { status: 204 };
      }
      case 'GET /api/users/username-available': {
        const u = url.searchParams.get('u') ?? '';
        return { status: 200, json: { available: !this.accounts.some((a) => a.user.username === u) } };
      }
      case 'PATCH /api/users/me': {
        this.record('updateMe', body);
        const { timerDefaults, onboarded, ...fields } = body as Partial<PublicUser> & { onboarded?: true };
        return this.updateCurrentUser((user) => ({
          ...user,
          ...fields,
          timerDefaults: { ...user.timerDefaults, ...timerDefaults },
          onboardedAt: user.onboardedAt ?? (onboarded ? new Date().toISOString() : null),
        }));
      }
      case 'GET /api/users/suggestions': {
        const users: SuggestedUser[] = this.accounts
          .filter((a) => a.user.id !== this.sessionUserId && a.user.onboardedAt)
          .map(({ user }) => ({
            id: user.id,
            name: user.name,
            username: user.username,
            avatarColor: user.avatarColor,
            studying: user.studying,
            subjects: user.subjects,
          }));
        return { status: 200, json: { users } };
      }
      case 'GET /api/users/me/following': {
        const me = this.currentAccount();
        if (!me) return error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
        const users: FollowedUser[] = me.user.following.flatMap((id) => {
          const account = this.accounts.find((a) => a.user.id === id);
          if (!account) return [];
          const { name, username, avatarColor } = account.user;
          return [{ id, name, username, avatarColor }];
        });
        return { status: 200, json: { users } };
      }
      case 'GET /api/progress/summary':
        if (!this.currentAccount()) return error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
        return { status: 200, json: this.progress };
      case 'GET /api/sessions/mine': {
        if (!this.currentAccount()) return error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
        const start = Number(url.searchParams.get('cursor') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 10);
        const end = start + limit;
        const sessions = this.mySessions.slice(start, end);
        return {
          status: 200,
          json: { sessions, nextCursor: end < this.mySessions.length ? String(end) : null },
        };
      }
      case 'GET /api/rooms/public': {
        const me = this.currentAccount();
        if (!me) return error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
        const rooms: RoomSummary[] = this.rooms
          .filter((room) => room.isPublic)
          .map((room) => {
            const { description: _d, goals: _g, inviteCode: _c, isHost: _h, ...summary } = room;
            const { totalSessions: _s, totalFocusMins: _f, ...card } = summary;
            return { ...card, hostFollowed: me.user.following.includes(room.host.id) };
          })
          .sort((a, b) => Number(b.hostFollowed) - Number(a.hostFollowed));
        return { status: 200, json: { rooms, nextPage: null } };
      }
      case 'POST /api/rooms': {
        this.record('createRoom', body);
        const me = this.currentAccount();
        if (!me) return error(401, 'UNAUTHENTICATED', 'Please log in to continue.');
        const room = makeRoom(me.user, {
          ...(body as Partial<RoomDetail>),
          id: `room-${this.rooms.length + 1}`,
          isHost: true,
        });
        this.rooms.unshift(room);
        return { status: 201, json: { room } };
      }
      default: {
        const inviteCode = url.pathname.match(/^\/api\/rooms\/invite\/([^/]+)$/)?.[1];
        if (inviteCode && method === 'GET') {
          const invite = this.invites[inviteCode];
          return invite
            ? { status: 200, json: invite }
            : error(404, 'ROOM_NOT_FOUND', 'We couldn’t find that room. Check the link and try again.');
        }
        const roomId = url.pathname.match(/^\/api\/rooms\/([^/]+)$/)?.[1];
        if (roomId && method === 'GET') {
          const room = this.rooms.find((r) => r.id === roomId);
          return room
            ? { status: 200, json: { room } }
            : error(404, 'ROOM_NOT_FOUND', 'We couldn’t find that room. Check the link and try again.');
        }
        const followId = url.pathname.match(/^\/api\/users\/([^/]+)\/follow$/)?.[1];
        if (followId && method === 'POST') {
          this.record('follow', followId);
          return this.updateCurrentUser((user) => ({
            ...user,
            following: [...new Set([...user.following, followId])],
          }));
        }
        if (followId && method === 'DELETE') {
          this.record('unfollow', followId);
          return this.updateCurrentUser((user) => ({
            ...user,
            following: user.following.filter((id) => id !== followId),
          }));
        }
        return error(404, 'NOT_FOUND', 'Not found.');
      }
    }
  }
}

function error(status: number, code: string, message: string) {
  const json: ApiErrorBody = { error: { code, message } };
  return { status, json };
}

/** Routes every /api request on this page to a fresh MockApi and returns it. */
export async function mockApi(page: Page): Promise<MockApi> {
  const api = new MockApi();
  // Keep tests offline: without Google's script the Google button falls back to its "unavailable" state.
  await page.route('https://accounts.google.com/**', (route) => route.abort());
  // The real server runs for the room tests, and it would reject the mock's fake tokens and end the session.
  // Keep sockets offline instead: the client just keeps trying to reconnect. (Polling comes before the upgrade.)
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
    const { status, json } = api.handle(request.method(), new URL(request.url()), body);
    await (json === undefined ? route.fulfill({ status }) : route.fulfill({ status, json }));
  });
  return api;
}
