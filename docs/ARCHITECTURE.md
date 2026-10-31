# StudiBrowse architecture

How the pieces fit together. The product rules come from `docs/SPEC.md`; this file explains how the code implements them. Keep it up to date in the same change as the code it describes.

## Workspaces

One pnpm monorepo, TypeScript everywhere.

| Workspace | Owns | Does not own |
| --- | --- | --- |
| `packages/shared` | zod schemas, shared types, Socket.IO event names and payload types, constants (`MAX_ROOM_SIZE`, `ROOM_GRACE_MS`, limits). Ships TypeScript source, no build step. | Any runtime behaviour. Nothing here talks to the network or the database. |
| `apps/server` | Express API and Socket.IO in one Node process, MongoDB via Mongoose, auth, permissions, the timer, room lifecycle, presence (in memory in v1), notifications. | UI. It never trusts timing or permissions sent by the client. |
| `apps/web` | React + Vite client: screens, routing, TanStack Query cache for REST data, the socket connection, theme. Draws the countdown locally from `endsAt`. | Business rules. It can hide a host-only button, but the server decides. |

`e2e` holds the Playwright tests and is not part of the app.

If a type or event name is needed on both sides, it lives in `packages/shared`. It is never copied.

## Request flow: REST

For things requested once: auth, profiles, room lists, history.

```
web (TanStack Query → fetch /api/...)
  → Vite proxy (dev) / same origin (prod)
  → Express: request logger → helmet → CORS → JSON body (100 kB) → cookies
             (the password, email and Google auth endpoints are also rate limited)
  → router (modules/<feature>/*.routes.ts)  validates input with the shared zod schema
  → controller                              reads req, calls the service, writes res
  → service                                 business logic + Mongoose; never sees req/res
  → JSON response
Errors at any step → errorHandler → { error: { code, message } }  (no stack traces)
```

Protected routes run `requireAuth` (`middleware/requireAuth.ts`), which reads `Authorization: Bearer <access token>` and sets `req.userId`.

## Request flow: Socket.IO

For everything live inside a room, and for notifications.

```
web: io(url, { auth: { token: <access token> } })
  → io.use(): verify the JWT, attach userId to the socket, join private room `user:<id>`
  → client emits an event (e.g. timer:start) with an ack callback
  → handler: 1. validate payload with the shared zod schema
             2. check permissions (member of the room? host?)
             3. call the service (same services as REST)
             4. ack the sender, broadcast the result to `room:<roomId>`
```

A handler that fails validation or a permission check acks `{ error: { code, message } }` and changes nothing. The server never sends per-second ticks. Every event is listed in `docs/SOCKET-EVENTS.md`.

## Auth

Built in Phase 1 (`modules/auth`, `modules/users`). Two tokens:

- **Access token:** a JWT (HS256, `ACCESS_TOKEN_TTL_SECONDS`, 15 minutes by default) whose `sub` is the user id. The web app keeps it in memory only, never in localStorage. It is sent as a Bearer header on REST calls and in the socket handshake.
- **Refresh token:** 32 random bytes in the `sb_refresh` cookie (`httpOnly`, `Secure`, `SameSite=Lax`, path `/api/auth`). The server stores only its SHA-256 hash in the `refreshtokens` collection (`userId`, `familyId`, `tokenHash`, `persistent`, `expiresAt` with a TTL index, `usedAt`), so it can be revoked. It lasts `REFRESH_TOKEN_TTL_DAYS` (30 by default) from the last refresh.

Passwords are hashed with bcrypt (cost `BCRYPT_COST`, 12). Usernames and emails are stored lowercased, so their unique indexes are case-insensitive. Users leave the server only through `toPublicUser()` (`modules/users/user.serializer.ts`), which copies an explicit list of fields; `passwordHash` is also `select: false` on the model.

| Endpoint | Does | Errors |
| --- | --- | --- |
| `POST /api/auth/signup` | Creates the account (shared `signupSchema`), sets the cookie, returns `{ accessToken, user }` (201) | 400 `VALIDATION_ERROR`, 409 `EMAIL_TAKEN` / `USERNAME_TAKEN` |
| `POST /api/auth/login` | `identifier` is an email if it contains `@`, otherwise a username (shared `loginSchema`) | 401 `INVALID_CREDENTIALS` (same for unknown accounts, wrong passwords and Google-only accounts) |
| `POST /api/auth/refresh` | Rotates the cookie, returns `{ accessToken, user }` | 401 `UNAUTHENTICATED`, 401 `REFRESH_TOKEN_REUSED`; the cookie is cleared on any failure |
| `POST /api/auth/logout` | Deletes the session's tokens and clears the cookie (204, also without a cookie) | none |
| `GET /api/auth/me` | `{ user }` for the access token | 401 `UNAUTHENTICATED`, 401 `TOKEN_EXPIRED` |
| `POST /api/auth/forgot` | Emails a reset link if an account uses the email (shared `forgotPasswordSchema`). Always 200 `{ ok: true }` | 400 `VALIDATION_ERROR`, 429 `RATE_LIMITED` |
| `POST /api/auth/reset` | Sets a new password from a reset link and signs the account out everywhere (204) (shared `resetPasswordSchema`) | 400 `RESET_TOKEN_INVALID` (unknown, used or expired) |
| `POST /api/auth/google` | Verifies a Google ID token, then signs in, links or creates the account. Sets the cookie, returns `{ accessToken, user }`: 201 for a new account, 200 otherwise (shared `googleAuthSchema`) | 401 `GOOGLE_TOKEN_INVALID`, 409 `GOOGLE_ACCOUNT_CONFLICT`, 503 `GOOGLE_NOT_CONFIGURED` |
| `GET /api/users/username-available?u=` | `{ available }`, for the live check on Sign up | 400 `VALIDATION_ERROR` |
| `PATCH /api/users/me` | Updates your own profile and settings (shared `updateMeSchema`: `avatarColor`, `studying`, `subjects`, `weeklyGoalMins`, `timerDefaults` merged per field, and `onboarded: true`, which sets `onboardedAt` the first time only). Strict: unknown fields such as `email` are rejected. Returns `{ user }` | 400 `VALIDATION_ERROR`, 401 |
| `GET /api/users/suggestions` | `{ users }`: up to 5 people for onboarding's Follow step, the most recently active first (`lastStudiedAt`, then `updatedAt`). Only people who finished onboarding, never you. Each is a `SuggestedUser` (`toSuggestedUser()`: no email or settings) | 401 |
| `POST /api/users/:id/follow` | Adds the person to your `following` (idempotent), returns `{ user }` | 400 `VALIDATION_ERROR` (bad id), 400 `CANNOT_FOLLOW_SELF`, 404 `USER_NOT_FOUND`, 401 |
| `DELETE /api/users/:id/follow` | Removes the person from your `following` (idempotent, also for deleted accounts), returns `{ user }` | 400 `VALIDATION_ERROR`, 401 |

Rate limits (`middleware/rateLimit.ts`, in memory):

- **Per IP:** 20 requests per 15 minutes, shared by signup, login, forgot, reset and google. Refresh and `/me` aren't limited because they run on every page load.
- **Per account:** login allows 10 *failed* attempts per identifier per 15 minutes, and forgot allows 3 requests per email per hour. These limiters key on the normalised body, so they run after validation. Any string counts the same whether or not an account uses it, so a 429 reveals nothing. The trade-off: someone can block password login for an account for 15 minutes. Google sign-in and password reset still work for its owner.

### Password reset

1. `POST /forgot` looks the email up. If no account uses it, nothing happens. Otherwise it deletes the user's older reset tokens (only the newest link works), stores the SHA-256 hash of a new 32-byte token in `passwordresettokens` (`userId`, `tokenHash`, `expiresAt` = 30 minutes (`RESET_TOKEN_TTL_MINS`) with a TTL index, `usedAt`), and emails `${CLIENT_ORIGIN}/reset-password#token=<token>`. The token is in the fragment so it never reaches a server log or a Referer header. The email is sent without awaiting it, so timing and provider errors don't reveal whether the account exists. Google-only accounts get a link too.
2. `POST /reset` marks the token used with one atomic update (so it works once, even under a race), sets the bcrypt hash and deletes all of the user's refresh tokens and reset tokens.
3. Access tokens already issued stay valid until they expire (15 minutes at most). This is a known v1 limitation.

Email goes through the `EmailService` interface (`lib/email/`). In production it uses Resend (one `fetch` to its API, with `RESEND_API_KEY` and `EMAIL_FROM`). Everywhere else the email is printed to the server log, so the reset link can be copied from there. Tests inject a recording fake through `createApp({ emailService })`.

### Google sign-in

The web app gets an ID token from Google Identity Services and posts it to `POST /google`. The server verifies it with google-auth-library (signature, issuer, expiry, audience = `GOOGLE_CLIENT_ID`) and requires `email_verified`. Then:

1. A user with this `googleId` → sign in.
2. Otherwise, a user with this email → link Google to it. We never verify emails at sign-up, so a password on that account may belong to someone who registered the address first. Linking therefore **removes the password and deletes every refresh and reset token** for the account. The owner can set a password again with Forgot password. If that account is already linked to a different Google id → 409 `GOOGLE_ACCOUNT_CONFLICT`.
3. Otherwise, create the account with the Google name and a suggested username (`modules/users/suggestUsername.ts`: the email's local part, reduced to `[a-z0-9_]`, plus random digits if it's taken). `onboardedAt` is null, so the client sends the user to onboarding, and they can change the username later.

A duplicate-key race (two tabs signing up at once, or someone taking the suggested username) reruns the lookup once. Without `GOOGLE_CLIENT_ID` (allowed outside production) the endpoint answers 503. Tests inject a fake verifier through `createApp({ verifyGoogleToken })`.

Flow:

1. Sign up, log in or Google sign-in → the server sets the refresh cookie and returns an access token.
2. On page load, the app calls `POST /api/auth/refresh` (the cookie is sent automatically) to get a fresh access token.
3. When a REST call returns 401 `TOKEN_EXPIRED`, the client refreshes once and retries. A socket rejected with an expired token reconnects with a new one.
4. Refresh rotates the token: the old one is marked used and a new one in the same family is set as the cookie. Presenting a used token again revokes the whole family (that login on that device), not the user's other devices.
5. Log out deletes the session's tokens and clears the cookie.

"Keep me logged in" decides whether the cookie is persistent (`Max-Age`) or a session cookie; the choice is carried through every rotation. It defaults to on for sign-up and off for log in, matching the forms.

Because each refresh token works exactly once, two tabs refreshing with the same cookie at the same moment would trip reuse detection. The web client must make sure only one refresh is in flight across tabs.

### Web client (`apps/web`)

- **Token storage:** `src/lib/api.ts` keeps the access token in a module variable, in memory only (never localStorage). All requests go through its `request()`, and the typed `authApi` / `usersApi` wrap the endpoints.
- **One refresh at a time:** `refreshSession()` is single-flight inside a tab (concurrent callers share one promise, which also covers React StrictMode running the startup effect twice). Across tabs it runs inside a Web Lock (`navigator.locks`, name `sb-refresh`), so tabs refresh one after another and each sends the newest cookie.
- **Expired tokens:** an authenticated call that gets 401 `TOKEN_EXPIRED` refreshes once and retries once. If that refresh fails, the session ends and the app treats the user as signed out.
- **Session state:** `features/auth/AuthContext.tsx` restores the session on load (`loading` → `signedIn` or `signedOut`) and exposes `signIn`, `setUser` (swap in the `user` a profile or follow request returned) and `logout`.
- **Route guards** (`features/auth/guards.tsx`):
  - `PublicOnlyRoute` wraps `/`, `/signup`, `/login` and `/forgot-password`. Signed-in users go to `resolveSignedInPath(user, next)`: `/onboarding` until `onboardedAt` is set, otherwise the `?next=` path (same-site paths only) or `/home`.
  - `RequireAuth` sends signed-out visitors to `/login?next=…`, or to `/` right after they log out.
  - Inside it, `RequireOnboarded` wraps the app pages (`/home` so far) and sends accounts without `onboardedAt` to `/onboarding?next=…`. `OnboardingRoute` wraps `/onboarding` and sends finished accounts on to `next` or `/home`. Finishing onboarding is just `setUser` with the new `onboardedAt`: the guard does the redirect.
- **Onboarding** (`features/onboarding/`): each Continue saves that step's answers with `PATCH /api/users/me`; follows are saved on click. The current step is kept in localStorage (`sb-onboarding:<userId>`), so a refresh reopens it with the saved answers. "Skip for now" and "Start studying" both send `onboarded: true`.
  - `/reset-password` works in either state.
- **Reset links:** the page reads the token from the URL fragment (`#token=…`) and then removes it from the address bar.
- **Google sign-in:** the web app renders Google's own button with Google Identity Services, with the same `GOOGLE_CLIENT_ID` from the repo-root `.env`: `vite.config.ts` passes it to the browser as `VITE_GOOGLE_CLIENT_ID` (a client id is public), unless `VITE_GOOGLE_CLIENT_ID` is set to override it. Only `src/lib/config.ts` reads it. Without a client id the button shows as unavailable.

## Timer: the server owns it

A room stores `timer { phase, round, endsAt, pausedRemaining }`. `phase` is `focus`, `shortBreak` or `longBreak`.

- **Running:** `endsAt` is a timestamp, and `pausedRemaining` is null. Each client shows `endsAt - now` and redraws locally, so the timer never drifts and a late joiner sees the right time at once.
- **Paused:** `endsAt` is null, and `pausedRemaining` holds the milliseconds left. Resuming sets `endsAt = now + pausedRemaining`.
- **Commands:** only the host can send `timer:start`, `timer:pause`, `timer:skip` or `timer:reset`. The server checks this on every call, updates the room and broadcasts `timer:state`.
- **Phase changes:** the server schedules a timeout for `endsAt`. When it fires, the server works out the next phase and round from `timerSettings`, logs the session after the last round, and either starts the next phase (if `autoStart` is on) or waits for the host. After a restart, the server reschedules from the stored `endsAt`.
- The phase and round maths live in pure functions (`realtime/timer.ts`) with unit tests.

## Room lifecycle

```
open ──last member leaves──▶ empty (emptySince = now) ──5 min, nobody back──▶ closed (deleted)
  ▲                               │
  └────────someone joins──────────┘  (emptySince = null)
```

- **Open:** at least one member is connected. At most `MAX_ROOM_SIZE` (20) members. If the host leaves, the host role passes to the member who has been there longest.
- **Empty:** the last socket left or disconnected. `emptySince` is set, but the room and its timer stay as they are, so a refresh or dropped connection doesn't end it.
- **Grace:** `ROOM_GRACE_MS` (5 minutes). Anyone who joins in that time clears `emptySince` and the room carries on.
- **Closed:** `jobs/roomCleanup.ts` runs every minute and deletes rooms whose `emptySince` is older than the grace period, together with their messages and resources (and stored files). Sessions stay in each person's history. The host can also close a room straight away. Invite links to a closed room show the Room closed page.

Room lifecycle and permissions have unit tests.
