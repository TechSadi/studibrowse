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
             (signup and login are also rate limited)
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
| `GET /api/users/username-available?u=` | `{ available }`, for the live check on Sign up | 400 `VALIDATION_ERROR` |

Only signup and login are rate limited; refresh and `/me` run on every page load.

Flow:

1. Sign up, log in or Google sign-in → the server sets the refresh cookie and returns an access token.
2. On page load, the app calls `POST /api/auth/refresh` (the cookie is sent automatically) to get a fresh access token.
3. When a REST call returns 401 `TOKEN_EXPIRED`, the client refreshes once and retries. A socket rejected with an expired token reconnects with a new one.
4. Refresh rotates the token: the old one is marked used and a new one in the same family is set as the cookie. Presenting a used token again revokes the whole family (that login on that device), not the user's other devices.
5. Log out deletes the session's tokens and clears the cookie.

"Keep me logged in" decides whether the cookie is persistent (`Max-Age`) or a session cookie; the choice is carried through every rotation. It defaults to on for sign-up and off for log in, matching the forms.

Because each refresh token works exactly once, two tabs refreshing with the same cookie at the same moment would trip reuse detection. The web client must make sure only one refresh is in flight across tabs (for example with a Web Lock or BroadcastChannel).

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
