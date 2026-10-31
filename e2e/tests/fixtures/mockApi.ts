import type { Page, Route } from '@playwright/test';
import type { ApiErrorBody, AuthResponse, PublicUser } from '@studibrowse/shared';

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
    subjects: [],
    weeklyGoalMins: 600,
    timerDefaults: { focusMins: 25, shortBreakMins: 5, longBreakMins: 15, roundsBeforeLong: 4 },
    streak: { current: 0, longest: 0 },
    lastStudiedAt: null,
    following: [],
    notificationPrefs: { roomOpened: true, roomFull: true, memberJoined: true, roundEnded: true },
    onboardedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

export class MockApi {
  accounts: MockAccount[] = [];
  sessionUserId: string | null = null;
  /** Request bodies by endpoint, e.g. calls.login[0]. */
  calls: Record<string, unknown[]> = {};

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
      default:
        return error(404, 'NOT_FOUND', 'Not found.');
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
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
    const { status, json } = api.handle(request.method(), new URL(request.url()), body);
    await (json === undefined ? route.fulfill({ status }) : route.fulfill({ status, json }));
  });
  return api;
}
