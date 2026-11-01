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

For everything live inside a room, for notifications, and for the lobby (the live list of public rooms on Home).

```
web: io({ auth: (cb) => cb({ token: <access token> }) })      (src/lib/socket.ts, opened after login)
  → io.use(socketAuth): verify the JWT, set socket.data.userId    (realtime/socketAuth.ts)
  → on connection: join private room `user:<id>`, add each feature's handlers   (realtime/io.ts)
  → client emits an event (e.g. timer:start) with an ack callback
  → onEvent wrapper (realtime/handler.ts):
             1. per-socket rate limit, if the event has one
             2. validate payload with the shared zod schema (clientEventSchemas)
             3. handler: check permissions (member of the room? host?), call the service (same services as REST)
             4. ack { ok: true, data }, broadcast the result to `room:<roomId>`
```

A handler that fails validation or a permission check acks `{ ok: false, error: { code, message } }` and changes nothing. Like the REST error handler, only `AppError` messages reach the client; anything else is logged and acked as `INTERNAL_ERROR`. Fire-and-forget events (`chat:typing`) go through `onSignal`, which drops what it rejects. The server never sends per-second ticks. Every event is listed in `docs/SOCKET-EVENTS.md`.

- **Handshake errors** reach the client as `connect_error` with `err.data = { code, message }`: `UNAUTHENTICATED` or `TOKEN_EXPIRED`.
- **Handlers** are registered per feature: `createIo(httpServer, { clientOrigin, registerHandlers })` takes a list of `(io, socket) => void` registrars: the room handlers (`realtime/handlers/room.handlers.ts`), the timer handlers (`realtime/handlers/timer.handlers.ts`), the chat handlers (`realtime/handlers/chat.handlers.ts`), the goal handlers (`realtime/handlers/goal.handlers.ts`) and the room settings handler (`realtime/handlers/settings.handlers.ts`). Tests pass their own.
- **Rate limits** (`realtime/socketRateLimit.ts`, sliding window, in memory, per socket id, cleared on disconnect): `chat:send` 5 per 5 seconds (acks `RATE_LIMITED`), `chat:typing` 10 per 5 seconds (dropped).
- **Chat** (`realtime/handlers/chat.handlers.ts`, `modules/chat/chat.service.ts`): `chat:send` checks the socket is in the room, saves the message, then sends `chat:new` to the whole room, sender included, so their other tabs stay in step. `chat:typing` is relayed to the rest of the room and never stored. Clients send `isTyping: true` at most every `TYPING_THROTTLE_MS` (2 s) while the draft isn't empty, and `false` when it's cleared, sent or the room is left; receivers stop showing someone `TYPING_CLEAR_MS` (3 s) after their last event, or as soon as their message arrives. On the web, `features/room/chat/` renders messages as React text (never as HTML) and turns only http(s) and `www.` links into `<a target="_blank" rel="noopener noreferrer">` (`linkify.ts`).
- **Goals** (`realtime/handlers/goal.handlers.ts`, `modules/goals/goals.service.ts`): goals live on the room document. Every `goal:*` handler checks the socket is in the room, then changes the goals with one atomic update and sends `goal:update` with the full list to the whole room. `goal:add` refuses an 11th goal (`GOAL_LIMIT`) or a duplicate text (`GOAL_EXISTS`, because Room settings matches goals by text) in the update's filter, so racing adds can't get past the limit. Anyone in the room can tick a goal. Only its author or the current host (from presence, checked on every call) can remove it. On the web, `features/room/goals/useRoomGoals.ts` lays your unacknowledged changes over the latest `goal:update` (`pendingGoals.ts`), so they show at once. Dropping a change when its ack arrives is also the rollback when the server refuses it.
- **Tests** use `test/socketHelpers.ts`: `startSocketServer()` runs the real server on a random port, and `connectUsers(n)` saves users and connects an authenticated socket.io-client for each.

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
| `PATCH /api/users/me` | Updates your own profile and settings (shared `updateMeSchema`: `avatarColor`, `studying`, `subjects`, `weeklyGoalMins`, `timerDefaults` merged per field, `timeZone` (an IANA zone `Intl` knows, such as `Europe/London`, or `UTC`), and `onboarded: true`, which sets `onboardedAt` the first time only). Strict: unknown fields such as `email` are rejected. Returns `{ user }` | 400 `VALIDATION_ERROR`, 401 |
| `GET /api/users/me/following` | `{ users }`: the people you follow, in the order you followed them, for the sidebar. Each is a `FollowedUser` (`toFollowedUser()`: id, name, username, avatarColor). Deleted accounts are left out | 401 |
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
- **Socket:** `src/lib/socket.ts` holds one socket per tab, opened by `AuthContext` when the user is signed in and closed when they aren't. Its `auth` option is a function, so every reconnect sends the current access token. On `TOKEN_EXPIRED` it calls `refreshSession()` and reconnects; if the refresh is refused, or the token is expired again right after a refresh, or the server says `UNAUTHENTICATED`, it ends the session through `endSession()` in `api.ts`, the same path REST uses. A refresh that can't reach the server is retried after 5 seconds. `emitWithAck()` resolves with the ack data or throws `ApiError` (status 0, the server's code, or `NETWORK_ERROR` after 10 seconds without an answer). `hooks/useSocket.ts` exposes `useSocket()` (`{ socket, status }`) and `useSocketEvent(event, handler)`.
- **Connection status:** `connecting` (first attempt), `connected`, `reconnecting` (after a drop or a failed first attempt) or `offline` (`navigator.onLine`). `components/ui/ConnectionStatus.tsx` shows a pill in the top bar and phone header only for `reconnecting` (amber) and `offline` (grey); it isn't in the mockup, so it reuses the live pill's shape.
- **Session state:** `features/auth/AuthContext.tsx` restores the session on load (`loading` → `signedIn` or `signedOut`) and exposes `signIn`, `setUser` (swap in the `user` a profile or follow request returned) and `logout`. Once signed in, if the browser's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) differs from the user's saved `timeZone`, it saves it with `PATCH /api/users/me`, because the server counts streak days in it. A failure is ignored until the next load.
- **Route guards** (`features/auth/guards.tsx`):
  - `PublicOnlyRoute` wraps `/`, `/signup`, `/login` and `/forgot-password`. Signed-in users go to `resolveSignedInPath(user, next)`: `/onboarding` until `onboardedAt` is set, otherwise the `?next=` path (same-site paths only) or `/home`.
  - `RequireAuth` sends signed-out visitors to `/login?next=…`, or to `/` right after they log out.
  - Inside it, `RequireOnboarded` wraps the app pages (`/home`, `/progress`, `/notifications`, `/settings`, `/u/:username` and `/room/:roomId`) and sends accounts without `onboardedAt` to `/onboarding?next=…`. `OnboardingRoute` wraps `/onboarding` and sends finished accounts on to `next` or `/home`. Finishing onboarding is just `setUser` with the new `onboardedAt`: the guard does the redirect.
- **Routes** live in `src/app/routes.tsx` (tests mount the same table in a memory router).
- **App shell** (`components/layout/AppShell.tsx`): the layout route for every signed-in page except the focus room. Sidebar (264px; an 80px icon rail from 768 to 1100px) with the menu, People you follow (`GET /api/users/me/following`, refetched when `user.following` changes), the streak card (from the progress summary, see Progress below; `lib/streak.ts` turns it into the seven dots, and falls back to the user's saved `streak` and `lastStudiedAt` if the summary can't load) and your profile. Below 768px the sidebar becomes a bottom tab bar (Home, Create, Progress, Settings) and a slim header. Each route's `handle.crumb` names the page in the top bar's breadcrumb and the tab title. The top-bar search filters Home's live rooms through the `?q=` param (`/` focuses it). Create a room opens through `/home?create=1` (`features/home/useCreateRoomDialog.ts`).
- **Onboarding** (`features/onboarding/`): each Continue saves that step's answers with `PATCH /api/users/me`; follows are saved on click. The current step is kept in localStorage (`sb-onboarding:<userId>`), so a refresh reopens it with the saved answers. "Skip for now" and "Start studying" both send `onboarded: true`.
  - `/reset-password` and `/r/:inviteCode` work in either state. Any other path shows the 404 page.
- **Reset links:** the page reads the token from the URL fragment (`#token=…`) and then removes it from the address bar.
- **Google sign-in:** the web app renders Google's own button with Google Identity Services, with the same `GOOGLE_CLIENT_ID` from the repo-root `.env`: `vite.config.ts` passes it to the browser as `VITE_GOOGLE_CLIENT_ID` (a client id is public), unless `VITE_GOOGLE_CLIENT_ID` is set to override it. Only `src/lib/config.ts` reads it. Without a client id the button shows as unavailable.

## Rooms (`modules/rooms/`)

Endpoints (all bodies, queries and params are validated with the shared zod schemas in `packages/shared/src/schemas/rooms.ts`):

| Endpoint | Auth | What it does |
| --- | --- | --- |
| `POST /api/rooms` | signed in | `createRoomSchema`: name (≤ 60), subject (optional, ≤ 40), description (optional, ≤ 200), `isPublic`, `maxSize` 2 to 20, up to 10 goals (≤ 120 each), `timerSettings` (the `TIMER_LIMITS` ranges, plus `autoStart`). The creator becomes the host. Answers 201 with the `RoomDetail`. |
| `GET /api/rooms/public` | signed in | Rooms worth joining. `page` (9 per page, `nextPage` is null on the last), `subject` (exact, any case), `q` (name or subject contains, plain text), `filter` = `all`, `open` (has space), `focus` or `break`. Each card is a `RoomSummary`: id, name, subject, host, `isPublic`, `maxSize`, `memberCount`, `isLive`, timer, `timerSettings`, `createdAt` and `hostFollowed`. |
| `GET /api/rooms/:id` | signed in | One room. |
| `POST /api/rooms/:id/uploads/sign` | signed in, in the room, rate limited per person (30 per 15 minutes) | `uploadSignSchema`: `fileName` (≤ 120), `size` (1 byte to 10 MB), `contentType` (PDF, JPEG, PNG, GIF or WebP). Answers `{ uploadUrl, fields }` for one upload straight to storage. 403 `NOT_A_MEMBER` unless you're in the room (presence), 503 `UPLOADS_UNAVAILABLE` when storage isn't configured. See Shared resources. |
| `GET /api/rooms/invite/:code` | public, rate limited per IP | Invite preview. An open room answers `{ status: 'open', room }`: id, name, subject, description, host, member count, the first 4 people as initials and avatar colour only, size, timer and goal texts. A closed room answers `{ status: 'closed', room }`: name, host and `roomsPerWeek` (rooms the host opened in the last 4 weeks ÷ 4, rounded), for the Room closed page. 404 `ROOM_NOT_FOUND` for an unknown code or a host account that's gone. |

- **Open** means `closedAt` is null; only open rooms are listed. **`isLive`** on a card means someone is in the room right now (`memberCount > 0`, people inside the reconnect window included), and decides the card's Live badge. An empty room in its grace period stays listed, without the badge. A new room starts with `emptySince` set (nobody is connected yet), so the cleanup job removes rooms nobody ever opened. Its timer starts idle: `{ phase: 'idle', round: 1, endsAt: null, pausedRemaining: null }`.
- **Visibility:** the public list only ever matches `isPublic: true, closedAt: null`. Private rooms never appear there, not even to their host or the host's followers. `GET /:id` answers 404 for someone else's private room (the same answer as a missing room, so ids can't be probed). The invite code is returned to the host, and for public rooms. The invite preview works for private rooms too, because holding the code is the permission. It includes the room id so a signed-in visitor can be sent into the room; the id grants nothing on its own, since joining a private room still needs the code.
- **Order:** rooms hosted by people you follow first, then newest (`$addFields hostFollowed` in an aggregation, with the host joined by `$lookup`). Rooms whose host account is gone are left out.
- **Phase filters** count only running timers: a paused or not-yet-started room is neither "In a focus round" nor "On a break".
- **Invite codes:** `nanoid(10)` (URL-safe alphabet, cryptographic randomness, 64^10 codes), unique index, retried on the rare collision. `INVITE_CODE_PATTERN` in shared is the one definition of a valid code; the Home join box uses it too.
- **Member counts** come from the in-memory presence store (`realtime/presence.ts`), one per person however many tabs they have open. "Has space" leaves out `fullRoomIds()` in the database query, so paging stays correct. A private room is also visible (`GET /:id`) to the people currently in it.
- **Web:** `roomsApi` in `lib/api.ts`. `features/rooms/CreateRoomDialog.tsx` (rendered by Home while `?create=1` is set, starting from your timer defaults) creates the room and opens `/room/:id`. In `mode="settings"` the same dialog is the host's Room settings (see Room settings below). `features/home/LiveRooms.tsx` loads pages through `useLiveRooms` (`features/home/useLiveRooms.ts`), a `useInfiniteQuery` keyed `['rooms', 'public', { filter, q, subject }]` (a card's subject tag sets `?subject=`) and kept live by the lobby (see Lobby below). The hero's Happening now card uses the same hook, unfiltered, and shows the first room whose timer is running, else the first with people in it (`pickHappeningNow` in `features/home/roomList.ts`), with a countdown redrawn every second from `endsAt`. `features/rooms/timerText.ts` works out a card's "N min left" from `endsAt`, and the cards redraw every 30 seconds. `components/ui/Modal.tsx` is the shared dialog: Escape and backdrop close it, Tab stays inside, and focus returns to the opener.

## Lobby: the live room list

Pages that list public rooms (Home now, Profile later) join the Socket.IO room `lobby` with `lobby:subscribe` and leave with `lobby:unsubscribe`. Events are in `docs/SOCKET-EVENTS.md` › Lobby.

- **Server:** `realtime/lobby.ts` holds `broadcastRoomCard(io, roomId)`, the one way a card reaches the lobby. It is called on every change a card shows:
  - the room created (`POST /api/rooms`, through `createApp`'s `onRoomCreated`)
  - someone new joins (`room:join`)
  - someone leaves for good (`depart()`: `room:leave`, the reconnect window ending, and the host handover that may follow)
  - room settings saved
  - every `timer:state` (a pause changes the card's text and the phase filters)
  - the cleanup job closing rooms (`startRoomCleanup`'s `onClosed`)

  Each send reads the room right then (`loadRoomCard` in `rooms.service.ts`): an open public room → `rooms:upsert` with its card (a `RoomSummary` without `hostFollowed`), a closed public room → `rooms:remove`, a private room → nothing. `removeRoomCard` sends `rooms:remove` straight away when the host makes a room private, and drops any send still waiting or still reading.
- **Coalescing:** at most one `rooms:upsert` per room per second (`LOBBY_COALESCE_MS`). The first change sends at once and opens a 1-second window; changes inside it are folded into one send when it closes, which opens the next window. State is in memory, like presence; `resetLobby()` clears it at shutdown and in tests.
- **Web:** `useLiveRooms(filters)` holds a lobby subscription while mounted, shared by every mounted list and counted per socket, so one list unmounting doesn't unsubscribe another. Each pushed card gets `hostFollowed` from `user.following` and is merged into that list's cache with `setQueryData` (`upsertRoom` / `removeRoom` in `features/home/roomList.ts`):
  - a listed room is updated in place, or dropped if it no longer matches the filters (`matchesRoomFilters` mirrors the server's query)
  - a new room goes where the server would list it (people you follow first, then newest), unless that's past the loaded pages, where Show more brings it in
  - other cached filters are marked stale

  On every reconnect it subscribes again (the server sees a new socket) and refetches the public lists once. Cards that arrive after the first render fade in (`.enter`, none with reduced motion).

## Timer: the server owns it

A room stores `timer { phase, round, endsAt, pausedRemaining }`. `phase` is `idle` (not started), `focus`, `shortBreak`, `longBreak` or `done` (every round finished).

- **Running:** `endsAt` is a timestamp, and `pausedRemaining` is null. Each client shows `endsAt - now` and redraws locally, so the timer never drifts and a late joiner sees the right time at once.
- **Paused:** `endsAt` is null, and `pausedRemaining` holds the milliseconds left. Resuming sets `endsAt = now + pausedRemaining`.
- **Idle and done:** both are null. `idle` is round 1; `done` keeps `round = totalRounds`.
- **Rules** (`realtime/timer.ts`, each a pure `(state, settings, now) → state`):
  - `start` works from `idle` or `done` ("Start again") and runs focus round 1.
  - `pause` works only while running, and `resume` only while paused.
  - `reset` goes back to `idle` from anywhere.
  - `skip` ends the current focus or break now. A running timer moves on as if the phase had ended. A paused one stays paused, at the full length of the next phase.
  - Invalid commands throw `409 INVALID_TIMER_COMMAND`.
- **Phase order:** after focus round `r`, the timer is `done` if `r` is the last round (no break after it). Otherwise it goes to a `longBreak` if `r % roundsBeforeLong === 0`, else a `shortBreak`, with the round unchanged. After a break comes focus round `r + 1`. With `autoStart` off, the next phase waits paused at full length for the host.
- **Commands:** only the host can send `timer:start`, `timer:pause`, `timer:skip` or `timer:reset`. `timer:start` is the mockup's one Start/Pause button: it starts from `idle` or `done` and resumes when paused. The timer handlers check membership and that the sender is the current host (from presence) on every call, then `realtime/roomTimer.ts` loads the room, applies the engine, saves `timer` to MongoDB and broadcasts `timer:state { roomId, timer, serverNow }`.
- **Phase changes:** `createRoomTimer()` (`realtime/roomTimer.ts`) keeps one `setTimeout` per running room, for its `endsAt`, replaced on every change and cancelled when the timer stops. When it fires, `advanceSteps` works out each phase that ended (normally one) from `timerSettings`, and the next phase either starts at once (if `autoStart` is on) or waits for the host. It times the next phase from the previous `endsAt`, not from now, so a late timeout doesn't drift. An early or stale timeout changes nothing. Reaching `done` logs the run's session (see Sessions).
- **One at a time per room:** commands and timeouts for the same room run through a per-room lock (`lib/keyedLock.ts`), so their load → save never interleave. In memory, like presence: one server process in v1.
- **Restarts:** timers live in MongoDB, so on the first database connection `restore()` reschedules every open room whose timer is running. A timer that ended while the server was down fires at once and catches up through every phase it missed.
- **Statuses follow the phase:** when the phase changes, every member who isn't Away becomes Focusing (focus) or Break (anything else), with `focusingSince` set to when the phase began, and the room gets `presence:update`. Pausing doesn't change anyone's status.
- **Focus credit:** see Sessions below.
- **Client clock:** `room:join` and `timer:state` both carry `serverNow`. `useRoomTimer(roomId, { timer, serverNow })` (`apps/web/src/features/room/useRoomTimer.ts`) keeps `clockOffset = serverNow − Date.now()` and, while running, recomputes `endsAt − (Date.now() + clockOffset)` (`roomClock.ts`) every animation frame, re-rendering only when the shown second changes. It never counts down on its own.
- The phase and round maths live in pure functions (`realtime/timer.ts`) with unit tests (`timer.test.ts`, fake clock).

## Sessions (`modules/sessions/`)

A session is one timer run: from `timer:start` (from `idle` or `done`) until the timer reaches `done` or the host resets it. The `sessions` collection holds one document per run: `roomId`, `roomName`, `startedAt`, `endedAt` (null while the run is still going), `participants [{ userId, focusedMins }]`, `goalsDone` and `goalsTotal` (the room's ticked goals and all its goals when the document was last written; the room's own goals are emptied when it closes), `roundsCompleted` and `roundsTotal` (the room's `timerSettings.totalRounds` when written; null on sessions saved before it was added).

Indexes: `{ participants.userId, startedAt: -1 }` for weeks and the summary, `{ participants.userId, endedAt: -1, _id: -1 }` for history, `{ roomId, startedAt: -1 }` for a room's sessions.

| Endpoint | Auth | What it does |
| --- | --- | --- |
| `GET /api/sessions/mine/latest?roomId=&since=` | signed in | The session summary after Leave (shared `latestSessionQuerySchema`; `since` is optional epoch ms in server time). Answers `LatestSessionResponse`: `session` is your latest session in that room by `startedAt`, last saved at or after `since` (null if none), with your own `focusedMins`; `roomOpen` (not `closedAt`); `week { focusMins, goalMins }`, your minutes in sessions that started this week against `weeklyGoalMins`; `streakDays`, your current streak if `lastStudiedAt` is today, else 0. Only your own sessions are ever read, so any room id is allowed. 400 `VALIDATION_ERROR`, 404 `ROOM_NOT_FOUND`. |
| `GET /api/sessions/mine?cursor=&limit=` | signed in | Your session history (shared `mySessionsQuerySchema`; `limit` 1 to `SESSION_HISTORY_PAGE_SIZE`, default 10). Answers `MySessionsResponse { sessions: MySession[], nextCursor }`, each with your own `focusedMins`, `roundsTotal` and `peopleCount` (participants, you included). The first page (no cursor) starts with your in-progress sessions (`endedAt: null`, newest `startedAt` first, at most a page of them), then finished ones by `endedAt` desc, `_id` desc. `nextCursor` is opaque (base64url `{ t: endedAt ms, id }`, `modules/sessions/sessionCursor.ts`) and marks the last finished session sent; the next page is everything strictly after it, so equal `endedAt`s are never skipped or repeated. If the first page is all in-progress sessions, the cursor points before every finished one. A cursor we didn't make is 400 `VALIDATION_ERROR`. |

- **Weeks** (`modules/sessions/week.ts`, pure): Sunday to Saturday in the user's `timeZone`, like Home's chart. A session counts toward the week it started in. In-progress documents count, so a partial save from leaving shows straight away.

- **Focus time counts** only while all three hold: the timer is running a focus phase (not paused, not a break), the person is Focusing (not Away or Break), and at least one of their tabs is connected. Presence (`realtime/presence.ts`) keeps, per member, `accruingSince` and `bankedMs`. Every change to one of those conditions (`setFocusRunning` from the room timer on start, resume, pause, skip, reset and every phase change; `setStatus`; a join; a tab dropping or coming back) first banks the time so far, then starts counting again if it still applies. So credits are exact: late joiners get only their part, paused time and Away time never count, and a dropped connection stops counting until it reconnects.
- **The run** lives on the room (`run { sessionId, startedAt, focus: [{ userId, focusedMs, firstFocusAt, lastFocusAt }], roundsCompleted }`, internal, never serialised). Every timer save drains everyone's banked time into it (`drainFocus` → `mergeFocusCredits`), so a restart loses at most the time since the last save. `roundsCompleted` counts focus phases that ended, on their own or skipped.
- **Leaving mid-run:** when someone leaves for good (`room:leave` from their last tab, or their reconnect window ran out), the room handlers call `roomTimer.memberLeaving` before taking them out of presence. Under the room's lock it drains just their time, saves the run, and upserts the run's session document (`endedAt: null`) with everyone's minutes so far, then records the leaver's study day. If they come back in another tab while that save runs, they stay.
- **Ending:** when the timer reaches `done` or is reset, `finalizeSession` writes the same document with `endedAt`, `goalsDone` (the room's ticked goals at that moment) and `roundsCompleted`, adds `$inc` to the room's `totalSessions` and `totalFocusMins`, records every participant's study day, and clears the run. The room gets `session:logged` right after `timer:state`. A room the cleanup job closes with a run still going is finalised first (`roomTimer.finalizeOnClose`), ending when the room emptied (`emptySince`), before its goals are emptied.
- **Minutes:** `focusedMins = floor(total ms / 60 000)`, always from the running total, so partial saves never lose seconds. People under a minute aren't participants, and a run where nobody reached a minute isn't logged at all (no document, no totals, no event).
- **Streaks** (`modules/sessions/streak.ts`, pure): days are calendar days in the user's `timeZone` (default `UTC`, kept in step by the web app). `nextStreak` adds a day when the study day is the day after `lastStudiedAt`'s, starts over at 1 after a gap, and changes nothing on the same day or an earlier one, so recording a study twice is harmless. Each participant is recorded at their `firstFocusAt` and `lastFocusAt`, so a run across midnight counts both days. `lastStudiedAt` only moves forward. Updates run under a per-user lock (`lib/keyedLock.ts`). The progress summary reports a streak whose last day is before yesterday as 0 (see Progress).
- Tests: minute accounting in `realtime/presence.test.ts`, streaks with time zones and DST in `modules/sessions/streak.test.ts`, the service in `sessions.service.test.ts` and the whole flow over real sockets in `realtime/handlers/timer.handlers.test.ts`.

## Progress (`modules/progress/`)

| Endpoint | Auth | What it does |
| --- | --- | --- |
| `GET /api/progress/summary?range=week` | signed in | Progress's tiles and chart, Home's "Your focus this week" and the sidebar streak card (shared `progressSummaryQuerySchema`; only `week` for now, 400 `VALIDATION_ERROR` otherwise). Answers `ProgressSummaryResponse`: `today` and `days` (this week's 7 days, Sunday to Saturday, as `YYYY-MM-DD` in your time zone, each with your minutes), `week { focusMins, goalMins, sessions, people, rooms }`, `lastWeek { focusMins }`, `streak { current, longest, studiedToday }`. |

- **Days come from Mongo.** The service works out this week's and last week's 14 day keys from `weekStartDay`, then runs one aggregation over your sessions since the day before last week's Sunday (UTC, earlier than that Sunday in any zone): `$dateToString` with the user's zone gives each session's local day, sessions outside the 14 days are dropped, and a `$facet` sums your own minutes per day and, for this week, counts sessions, distinct rooms and distinct other participants. DST needs no special handling.
- **Zones:** `resolveTimeZone` (`modules/sessions/streak.ts`) swaps a zone Node doesn't know for `UTC` before it reaches Mongo, the same fallback streaks use.
- **What counts:** as for the weekly goal, a session counts toward the day it started, and in-progress documents count, so leaving mid-run shows up at once.
- **Streak:** `current` is 0 unless `lastStudiedAt` is today or yesterday in your zone (streaks only change when a session is logged, so the stored number can be stale). The web client no longer guesses this with the browser's zone.
- **Web** (`features/progress/`): `queries.ts` holds `useProgressSummary()` (one query, key `['progress', 'summary', 'week']`, shared by the sidebar, Home and Progress) and `useMySessions(cursor, limit)` (Home asks for `RECENT_SESSIONS_COUNT`, Progress pages with Newer/Older, keeping a stack of visited cursors). The session summary dialog calls `invalidateProgress` once it loads, so everything refreshes after a session. `FocusByDayChart.tsx` draws the bars as SVG at the container's measured width (`hooks/useElementWidth.ts`), as one `role="img"` with a `<desc>` listing every day. Day keys from the server are formatted in UTC so the browser's zone can't shift them (`format.ts`).
- Tests: `progress.service.test.ts` (zones, the DST change, distinct people and rooms, streak), `progress.test.ts`, history paging in `modules/sessions/sessions.test.ts`, and `e2e/tests/progress.spec.ts`.

## Room lifecycle

```
open ──last socket leaves──▶ empty (emptySince = now) ──5 min, nobody back──▶ closed (closedAt = now)
  ▲                               │
  └────────someone joins──────────┘  (emptySince = null)
```

- **Presence** (`realtime/presence.ts`) is in memory, keyed by room and then user, with every socket (tab) each user has there. It holds each member's profile, `joinedAt`, status, "working on" note and `focusingSince`, plus the room's `maxSize` and current host. It has no timers and no database; the room handlers (`realtime/handlers/room.handlers.ts`) drive it and broadcast `presence:update` on every change.
- **Joining:** `room:join` checks the room exists and isn't closed, that you may join (public; private with the invite code; or you're the host or already in it), and that it has space. Seats are counted by person: a second tab of someone already in never counts. The check and the add run with no `await` between them, so two people can't take the last seat together. A newcomer's status follows the timer phase (focus → Focusing, breaks → Break).
- **Leaving vs disconnecting:** `room:leave` removes you at once (once all your tabs in that room have left). A disconnect is not a leave: when your last socket drops you keep your place, your `joinedAt` and your status for `RECONNECT_GRACE_MS` (30 seconds), and only then are you removed and the room told. A rejoin inside that window cancels the removal.
- **Host handover:** when the host leaves for good (leave, or their reconnect window runs out), the member who has been there longest becomes host, in presence and in the database (`hostId`), and `presence:update` carries the new `isHost`.
- **Open:** at least one member is in the room. At most `maxSize` (2 to 20) people.
- **Empty:** the last socket left or disconnected. `emptySince` is set straight away, but the room and its timer stay as they are, so a refresh or dropped connection doesn't end it.
- **Grace:** `ROOM_GRACE_MS` (5 minutes). Anyone who joins in that time clears `emptySince` and the room carries on.
- **Closed:** `jobs/roomCleanup.ts` runs every 30 seconds and closes rooms whose `emptySince` is older than the grace period and that have nobody in presence (someone inside a reconnect window still counts): it logs a run that was still going (see Sessions), sets `closedAt`, empties the goals and deletes their messages, resources and stored files (the room's whole storage folder, so uploads that were never shared go too; a storage failure is logged and doesn't stop the rest). The room document stays so invite links can show the Room closed page. Sessions stay in each person's history. The host can also close a room straight away. Because presence is lost on a restart, the job first gives every open room with `emptySince: null` a fresh grace period.

- **Room settings:** the host's Room settings dialog sends `room:settings` (the Create a room fields plus `roomId`). The handler checks the socket is in the room and the sender is the current host, then `updateRoomSettings` refuses a `maxSize` below the people already in the room (`ROOM_TOO_SMALL`), saves the rest and merges goals by text (a goal that stays keeps its id, tick and author; new ones are added by the host). Presence takes the new `maxSize`, and the room gets `room:update` (plus `goal:update` when the goals changed). A running phase keeps its `endsAt`; the timer reads the settings again when the phase ends, so timer changes apply from the next phase.
- **Removal:** a removed member's sockets get `room:removed { roomId }` on `user:<id>`. The client shows "You were removed" and doesn't rejoin. The server sends it once `member:remove` is built (Phase 4).

Room lifecycle and permissions have unit tests.

## Shared resources (`modules/resources/`, `lib/storage/`)

A room's Files tab holds links and files (PDFs and images up to 10 MB). MongoDB keeps only the resource: `{ roomId, userId, type, title, url, size, fileName, downloadUrl, thumbnailUrl }`. File bytes live in Cloudinary and never pass through our server.

- **`StorageService`** (`lib/storage/storageService.ts`) is the only code that knows about Cloudinary: `signUpload`, `findRoomFile`, `deleteFile`, `deleteRoomFiles`, `downloadUrl`, `thumbnailUrl`. `createStorageService(env)` returns the Cloudinary one (`cloudinaryStorageService.ts`, plain `fetch` and `node:crypto`, no SDK) when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are set (required in production), and a disabled one otherwise, which refuses to sign uploads; links still work. `createApp`, `createResourceHandlers` and `startRoomCleanup` take it as a dependency, so tests pass `test/fakeStorage.ts`.
- **Uploading a file:**
  1. The client checks the type and size, then asks `POST /api/rooms/:id/uploads/sign`. The server checks you're in the room and signs (SHA-1, Cloudinary's scheme) a single upload: `public_id` `studibrowse/rooms/<roomId>/<random>`, `allowed_formats` `pdf,jpg,png,gif,webp`, `overwrite=false` (so a reused signature can't swap the file after it was checked), `timestamp` (Cloudinary rejects signatures older than an hour).
  2. The client posts the file and the signed fields straight to Cloudinary's `image/upload` (PDFs are `image` resources in Cloudinary) with `XMLHttpRequest`, for upload progress, and gets back `secure_url`.
  3. The client sends `resource:add` with that url. The server only accepts a plain delivery url of an upload in this room's folder of our account (`res.cloudinary.com/<cloud>/image/upload/[v<n>/]studibrowse/rooms/<roomId>/<id>.<ext>`, no transformations), then asks the Admin API for the stored file's real `bytes` and `format`. The client's `size` is never trusted. A file over 10 MB or of another format is deleted and refused. Then it saves the resource with `downloadUrl` (`fl_attachment:<original name>`, so the browser saves the file instead of opening it) and, for images, `thumbnailUrl` (`c_fill,w_80,h_80`), and the room gets `resource:new`.
- **Removing:** whoever shared it or the current host (from presence, checked on every call). A file is deleted from Cloudinary too (best effort: the room's folder is deleted at close anyway).
- **Closing:** the cleanup job deletes `studibrowse/rooms/<roomId>/` by prefix. The Files tab says files are deleted when the room closes.
- **Cloudinary setup:** free accounts block PDF delivery until *Settings › Security › Allow delivery of PDF and ZIP files* is turned on. Without it, uploaded PDFs can't be opened or downloaded.
- **Web:** `features/room/files/useRoomFiles.ts` (share a link, upload with progress and cancel, remove; uploads still running are cancelled when you leave), `files/uploadFile.ts` (the XHR upload) and `FilesPanel.tsx`. The list comes from the room session (`resource:new`, `resource:removed`), newest first: a PDF tile, an image thumbnail or a URL tile; Open in a new tab; Download for files; × for your own or, as host, anyone's.

## Invite links (web, `features/invite/`)

`/r/:inviteCode` (`InvitePage.tsx`) works signed in or out and has no sidebar; it shares the `.solo` layout (`components/layout/SoloScreen.tsx`) with the room state screens.

- A code that doesn't match `INVITE_CODE_PATTERN` shows "We couldn't find that room" without a request, as does a 404.
- **Open room, signed in:** straight to `/room/:id?invite=<code>` (onboarding first, through `RequireOnboarded`, if it isn't finished).
- **Open room, signed out:** the preview (mockup `#invite`). Sign up to join and Log in go to `/signup` or `/login` with `?next=/r/<code>`, so after signing up (and onboarding) you come back here and go into the room; a room that closed in the meantime shows Room closed instead. The Sign up / Log in switch links keep `?next=`. The preview is fetched again every 30 seconds, and just after the current phase ends (`invitePreview.ts › refetchDelay`); the time left is worked out from `endsAt` every second.
- **Closed room:** Room closed (mockup `#closed`) with a Follow button for the host (sign up first when signed out; hidden when you were the host) and links to live rooms and Create a room.

## Focus room (web, `features/room/`)

`/room/:roomId` (`RoomPage.tsx`) has no sidebar. `?invite=<code>` carries a private room's invite code for people who aren't its host.

- **Joining:** `useRoomSession` emits `room:join` as soon as the socket is connected and again on every `connect` (Socket.IO doesn't rejoin rooms after a reconnect). A pure reducer (`roomSession.ts`) holds the state: `joining`, `joined`, `rejoining` (connection dropped, room still on screen under a banner), `left` (you pressed Leave; the room as it was stays for the summary), `full`, `closed`, `notFound`, `removed` or `error`. It follows `presence:update`, `room:update`, `goal:update`, `resource:new`, `resource:removed` and `room:removed`. Each successful join makes a new timer snapshot and message list, which `useRoomTimer` and `useRoomChat` take as a fresh start. Leaving the page (the back arrow or any link) sends `room:leave`; a refresh or closed tab is a disconnect, with the server's 30-second window.
- **Leave and the session summary:** Leave moves the state to `left` (which counts as ended, so nothing rejoins or leaves twice), unmounts the room (cancelling uploads) and sends `room:leave`. Its ack comes after the server saved your focus time, and only then does `SessionSummaryDialog` load `GET /api/sessions/mine/latest` with `since` = the visit's `joinedAt` (the first join's `serverNow`; reconnects keep it). It shows focused time, rounds and room goals (zeros and the goals as you left them when there's no session from this visit), the weekly goal row and streak (`sessionSummary.ts`), Back to home, and Rejoin the room only while `roomOpen`. Escape and the backdrop go home. Rejoin starts a new visit. The dialog is built on `components/ui/ModalShell.tsx`, the scrim, focus trap and Escape handling that `Modal` also uses.
- **Host:** taken from presence (`isHost` on your member), so a hand-over shows at once. Only the host sees the timer controls and Settings; everyone else sees who controls the timer.
- **Timer:** `timerView.ts` turns the server timer and the time left into what the ring shows (phase, clock, round, dots). The tab title shows the time left while a phase runs. `useTimerSounds` plays Web Audio sounds (`chime.ts`) for everyone in the room: three quick rising notes when the host starts a run (from idle or done), and a soft two-note chime when a focus round or break ends. One mute switch covers both, saved in localStorage as `sb-sound`.
- **Side panel:** Chat, Goals, People and Files as an ARIA tablist; every pane stays mounted so the chat keeps its draft. Below 1100px it is a drawer opened from the dock, which counts unread chat messages. The Files pane is described under Shared resources.
