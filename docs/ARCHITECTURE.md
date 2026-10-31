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
  → Express: request logger → helmet → CORS → JSON body (100 kB) → rate limit (/api/auth)
  → router (modules/<feature>/*.routes.ts)  validates input with the shared zod schema
  → controller                              reads req, calls the service, writes res
  → service                                 business logic + Mongoose; never sees req/res
  → JSON response
Errors at any step → errorHandler → { error: { code, message } }  (no stack traces)
```

Protected routes run an auth middleware before the router that reads `Authorization: Bearer <access token>` and sets the user.

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

Built in Phase 1. Two tokens:

- **Access token:** a short-lived JWT (about 15 minutes) holding the user id. The web app keeps it in memory only, never in localStorage. It is sent as a Bearer header on REST calls and in the socket handshake.
- **Refresh token:** a long-lived random token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie scoped to `/api/auth`. The server stores only its hash so it can be revoked.

Flow:

1. Sign up, log in or Google sign-in → the server sets the refresh cookie and returns an access token.
2. On page load, the app calls `POST /api/auth/refresh` (the cookie is sent automatically) to get a fresh access token.
3. When a REST call returns 401, the client refreshes once and retries. A socket rejected with an expired token reconnects with a new one.
4. Refresh rotates the token: the old one is invalidated and a new cookie is set. Reusing an old refresh token revokes the whole session.
5. Log out deletes the stored refresh token and clears the cookie.

"Keep me logged in" decides whether the cookie is persistent or a session cookie. The new env vars (JWT secret, token lifetimes) are added to `env.ts` and `.env.example` in Phase 1.

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
