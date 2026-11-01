import type {
  ApiErrorBody,
  AuthResponse,
  CreateRoomInput,
  CreateRoomResponse,
  FollowingResponse,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  GoogleAuthInput,
  InvitePreviewResponse,
  LatestSessionResponse,
  LoginInput,
  MeResponse,
  PublicRoomsQuery,
  PublicRoomsResponse,
  ResetPasswordInput,
  RoomResponse,
  SignupInput,
  SuggestionsResponse,
  UpdateMeInput,
  UploadSignInput,
  UploadSignResponse,
  UsernameAvailabilityResponse,
} from '@studibrowse/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown for fetch failures (offline, server down), so forms can show one friendly message. */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

// The access token lives in memory only (never localStorage). The refresh token is an httpOnly cookie.
let accessToken: string | null = null;
let onSessionEnded: (() => void) | null = null;
let refreshInFlight: Promise<AuthResponse> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Called when an authenticated request fails because the session can't be refreshed. */
export function setSessionEndedHandler(handler: (() => void) | null) {
  onSessionEnded = handler;
}

/** Ends the session because it can't be refreshed. Used by REST calls here and by the socket. */
export function endSession() {
  accessToken = null;
  onSessionEnded?.();
}

interface RequestOptions {
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function send(method: string, path: string, { body, auth, signal }: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? null : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(
      0,
      NETWORK_ERROR_CODE,
      'Can’t reach StudiBrowse. Check your connection and try again.',
    );
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  if (body?.error) return new ApiError(res.status, body.error.code, body.error.message);
  // Our server always answers errors with a JSON body, so a bare 5xx came from something in front of it
  // (the dev proxy or a load balancer) that couldn't reach it.
  if (res.status >= 500) {
    return new ApiError(
      res.status,
      NETWORK_ERROR_CODE,
      'Can’t reach StudiBrowse right now. Please try again in a moment.',
    );
  }
  return new ApiError(res.status, 'UNKNOWN', 'Something went wrong.');
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(method, path, options);

  if (!res.ok && options.auth && res.status === 401) {
    const error = await toApiError(res);
    if (error.code !== 'TOKEN_EXPIRED') throw error;
    try {
      await refreshSession();
    } catch (refreshError) {
      endSession();
      throw refreshError;
    }
    res = await send(method, path, options);
  }

  if (!res.ok) throw await toApiError(res);
  return parse<T>(res);
}

/**
 * Exchanges the refresh cookie for a new access token. The server rotates the cookie on every refresh and ends
 * the session if an old one is reused, so only one refresh may run at a time: callers in this tab share one
 * promise, and a Web Lock queues refreshes across tabs so each sends the newest cookie.
 */
export function refreshSession(): Promise<AuthResponse> {
  refreshInFlight ??= withRefreshLock(() => request<AuthResponse>('POST', '/api/auth/refresh'))
    .then(
      (session) => {
        accessToken = session.accessToken;
        return session;
      },
      (err: unknown) => {
        accessToken = null;
        throw err;
      },
    )
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('sb-refresh', fn) : fn();
}

export const authApi = {
  signup: (input: SignupInput) => request<AuthResponse>('POST', '/api/auth/signup', { body: input }),
  login: (input: LoginInput) => request<AuthResponse>('POST', '/api/auth/login', { body: input }),
  google: (input: GoogleAuthInput) => request<AuthResponse>('POST', '/api/auth/google', { body: input }),
  forgot: (input: ForgotPasswordInput) =>
    request<ForgotPasswordResponse>('POST', '/api/auth/forgot', { body: input }),
  reset: (input: ResetPasswordInput) => request<void>('POST', '/api/auth/reset', { body: input }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  me: () => request<MeResponse>('GET', '/api/auth/me', { auth: true }),
};

export const usersApi = {
  usernameAvailable: (username: string, signal?: AbortSignal) =>
    request<UsernameAvailabilityResponse>(
      'GET',
      `/api/users/username-available?u=${encodeURIComponent(username)}`,
      signal ? { signal } : {},
    ),
  updateMe: (input: UpdateMeInput) =>
    request<MeResponse>('PATCH', '/api/users/me', { body: input, auth: true }),
  following: () => request<FollowingResponse>('GET', '/api/users/me/following', { auth: true }),
  suggestions: () => request<SuggestionsResponse>('GET', '/api/users/suggestions', { auth: true }),
  follow: (userId: string) =>
    request<MeResponse>('POST', `/api/users/${encodeURIComponent(userId)}/follow`, { auth: true }),
  unfollow: (userId: string) =>
    request<MeResponse>('DELETE', `/api/users/${encodeURIComponent(userId)}/follow`, { auth: true }),
};

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const roomsApi = {
  create: (input: CreateRoomInput) =>
    request<CreateRoomResponse>('POST', '/api/rooms', { body: input, auth: true }),
  listPublic: (query: Partial<PublicRoomsQuery> = {}) =>
    request<PublicRoomsResponse>('GET', `/api/rooms/public${queryString(query)}`, { auth: true }),
  get: (roomId: string) =>
    request<RoomResponse>('GET', `/api/rooms/${encodeURIComponent(roomId)}`, { auth: true }),
  invite: (code: string) =>
    request<InvitePreviewResponse>('GET', `/api/rooms/invite/${encodeURIComponent(code)}`),
  signUpload: (roomId: string, input: UploadSignInput) =>
    request<UploadSignResponse>('POST', `/api/rooms/${encodeURIComponent(roomId)}/uploads/sign`, {
      body: input,
      auth: true,
    }),
};

export const sessionsApi = {
  latestMine: (roomId: string, since?: number) =>
    request<LatestSessionResponse>('GET', `/api/sessions/mine/latest${queryString({ roomId, since })}`, {
      auth: true,
    }),
};
