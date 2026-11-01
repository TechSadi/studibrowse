import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse, PublicUser } from '@studibrowse/shared';
import {
  ApiError,
  authApi,
  getAccessToken,
  NETWORK_ERROR_CODE,
  refreshSession,
  setAccessToken,
  setSessionEndedHandler,
} from './api';

const user = { id: 'u1', username: 'alex' } as PublicUser;
const session = (token: string): AuthResponse => ({ accessToken: token, user });
const errorResponse = (status: number, code: string) =>
  Response.json({ error: { code, message: `${code} message` } }, { status });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
  setSessionEndedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request errors', () => {
  it('turns the error body into an ApiError with the server code and message', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 'INVALID_CREDENTIALS'));
    const err = await authApi.login({ identifier: 'a', password: 'b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'INVALID_CREDENTIALS message',
    });
  });

  it('reports fetch failures as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(authApi.forgot({ email: 'a@b.co' })).rejects.toMatchObject({ code: NETWORK_ERROR_CODE });
  });

  it('reports a bare 5xx (server down behind a proxy) as unreachable, not a generic error', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    await expect(authApi.google({ credential: 'x' })).rejects.toMatchObject({
      code: NETWORK_ERROR_CODE,
      message: 'Can’t reach StudiBrowse right now. Please try again in a moment.',
    });
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(authApi.logout()).resolves.toBeUndefined();
  });
});

describe('refreshSession', () => {
  it('shares one refresh between concurrent callers and stores the new token', async () => {
    fetchMock.mockResolvedValue(Response.json(session('fresh')));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(getAccessToken()).toBe('fresh');
  });

  it('clears the token when the refresh fails', async () => {
    setAccessToken('old');
    fetchMock.mockResolvedValue(errorResponse(401, 'UNAUTHENTICATED'));
    await expect(refreshSession()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(getAccessToken()).toBeNull();
  });
});

describe('authenticated requests', () => {
  it('sends the access token as a bearer token', async () => {
    setAccessToken('t1');
    fetchMock.mockResolvedValue(Response.json({ user }));
    await authApi.me();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t1');
  });

  it('refreshes once on TOKEN_EXPIRED and retries with the new token', async () => {
    setAccessToken('expired');
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'TOKEN_EXPIRED'))
      .mockResolvedValueOnce(Response.json(session('fresh')))
      .mockResolvedValueOnce(Response.json({ user }));

    await expect(authApi.me()).resolves.toEqual({ user });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/auth/me',
      '/api/auth/refresh',
      '/api/auth/me',
    ]);
    const retry = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect((retry.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('ends the session when the refresh after TOKEN_EXPIRED fails', async () => {
    const ended = vi.fn();
    setSessionEndedHandler(ended);
    setAccessToken('expired');
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'TOKEN_EXPIRED'))
      .mockResolvedValueOnce(errorResponse(401, 'REFRESH_TOKEN_REUSED'));

    await expect(authApi.me()).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    expect(ended).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh for other 401s', async () => {
    setAccessToken('bad');
    fetchMock.mockResolvedValue(errorResponse(401, 'UNAUTHENTICATED'));
    await expect(authApi.me()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
