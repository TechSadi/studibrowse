# Socket.IO events

Every real-time event, from the spec's Socket.IO events section (`docs/SPEC.md`). Event names, payload schemas and types live in `packages/shared/src/events.ts` (`ClientToServerEvents`, `ServerToClientEvents`, `clientEventSchemas`); the realtime entity types (`PresenceMember`, `ChatMessage`, `RoomResource`, `SessionSummary`, `AppNotification`) live in `packages/shared/src/types/realtime.ts`. Update this file in the same change as those files.

## Connecting

The client connects with `io({ auth: { token: <access token> } })`. The server's `io.use()` middleware verifies the token and stores the user id on `socket.data.userId`. A rejected handshake reaches the client's `connect_error` listener with `err.data = { code, message }`:

| Code | Meaning | What the web client does |
| --- | --- | --- |
| `UNAUTHENTICATED` | No token, not a string, bad signature, no user id | Ends the session (signed out) |
| `TOKEN_EXPIRED` | The access token expired | Refreshes once and reconnects. Expired again straight after a refresh → ends the session |

On connect, every socket joins its user's private room `user:<id>`, so a notification reaches all of that user's tabs.

## Acks

**Rules for every client → server event:** the handler wrapper (`apps/server/src/realtime/handler.ts`) applies the event's rate limit, validates the payload with its schema from `clientEventSchemas`, and only then runs the handler, which checks permissions before doing anything. Every acknowledged event answers with:

```ts
{ ok: true, data }                       // data per event, below
{ ok: false, error: { code, message } }
```

The codes every event can return are `VALIDATION_ERROR` (the message names the first problem), `RATE_LIMITED` and `INTERNAL_ERROR` ("Something went wrong.", the real error is only logged). Handlers add their own codes through `AppError`. `chat:typing` has no ack: invalid or rate-limited typing events are dropped.

"Member" means the sender has joined that room. Every id is a 24-character hex ObjectId. Payloads are strict: unknown fields are rejected.

## Events

| Event | Direction | Payload | Who may send it | Response |
| --- | --- | --- | --- | --- |
| `room:join` | client → server | `{ roomId, inviteCode? }`. `inviteCode` is the 10-character code from the invite link | Any signed-in user, while the room is open and has fewer than `maxSize` people (counted by person, not tab). A private room also needs `inviteCode`, unless you're its host or already in it | Ack data: `{ room, members, resources, messages, serverNow }`. `room` is the `RoomDetail` and already holds the timer and goals; `members` is longest present first; `messages` is the last 50, oldest first; `serverNow` is the server's clock in epoch ms, for the timer's clock offset. A newcomer's status follows the timer phase. Room gets `presence:update`. Errors: `ROOM_NOT_FOUND` (missing, or private without the right code), `ROOM_CLOSED`, `ROOM_FULL` |
| `room:leave` | client → server | `{ roomId }` | Member (this socket joined the room). Error: `NOT_A_MEMBER` | Ack data: `{}`. Once all your tabs in the room have left, your focus time so far is saved to the run's session (in progress) and your streak updated, then you're removed straight away and the room gets `presence:update`. If the room now has no sockets, the 5-minute grace starts. The ack comes after that save, so the web app loads the session summary (`GET /api/sessions/mine/latest`) once it arrives |
| `room:settings` | client → server | The Create a room fields (`createRoomSchema`) plus `roomId` | Host. Errors: `NOT_A_MEMBER`, `NOT_HOST`, `ROOM_TOO_SMALL` (`maxSize` below the people already in the room), `ROOM_CLOSED` | Ack data: `{}`. Saved, then the room gets `room:update`, and `goal:update` if the goals changed. Goals are matched by text, so one that stays keeps its tick. Timer changes apply from the next phase |
| `room:update` | server → room | `{ roomId, settings: { name, subject, description, isPublic, maxSize, timerSettings } }` | Server only | n/a |
| `room:removed` | server → `user:<id>` | `{ roomId }` | Server only. Sent to a member the host removed | n/a. The client shows "You were removed" and doesn't rejoin |
| `presence:update` | server → room | `{ roomId, members: [{ userId, name, username, avatarColor, status, workingOn, isHost, joinedAt, focusingSince }] }` | Server only | n/a |
| `status:set` | client → server | `{ roomId, status?: 'focusing' \| 'break' \| 'away', workingOn? }`. At least one of the two; `workingOn` is trimmed, up to 80 characters, and `''` clears it | Member (own status only). Error: `NOT_A_MEMBER` | Ack data: `{}`. Room gets `presence:update` |
| `chat:send` | client → server | `{ roomId, text }`. `text` is trimmed, 1 to 1000 characters (`CHAT_TEXT_MAX`) | Member (`NOT_A_MEMBER` otherwise). 5 per 5 seconds per socket | Ack data: `{ message }`. Saved, then the whole room gets `chat:new`, sender included |
| `chat:new` | server → room | `{ message: { id, roomId, userId, text, createdAt } }`. The sender's ack carries the same message, so clients skip ids they already have | Server only | n/a |
| `chat:typing` | both | Client: `{ roomId, isTyping }`. Server: `{ roomId, userId, isTyping }` | Member. 10 per 5 seconds per socket | No ack. Sent to the rest of the room (your other tabs included). Clients send `true` at most every `TYPING_THROTTLE_MS` (2 s) and `false` when they stop; receivers clear someone after `TYPING_CLEAR_MS` (3 s) without a new event, or when their message arrives |
| `timer:start` | client → server | `{ roomId }` | Host | Ack data: `{}`. From `idle` or `done` starts focus round 1; when paused (or waiting for the host between phases) resumes. Room gets `timer:state` |
| `timer:pause` | client → server | `{ roomId }` | Host | Ack data: `{}`. Only while running. Room gets `timer:state` |
| `timer:skip` | client → server | `{ roomId }` | Host | Ack data: `{}`. Ends the current focus or break now. Room gets `timer:state` |
| `timer:reset` | client → server | `{ roomId }` | Host | Ack data: `{}`. Back to `idle`. Room gets `timer:state` |
| `timer:state` | server → room | `{ roomId, timer: { phase, round, endsAt, pausedRemaining }, serverNow }`. `endsAt` is ISO or null; `serverNow` is the server's clock in epoch ms | Server only. Sent after every command and whenever a phase ends on its own | n/a |
| `goal:add` | client → server | `{ roomId, text }`. `text` is trimmed, 1 to 120 characters (`GOAL_TEXT_MAX`) | Member. Errors: `NOT_A_MEMBER`, `GOAL_LIMIT` (the room already has 10, `MAX_GOALS`), `GOAL_EXISTS` (same text as a goal it has), `ROOM_CLOSED` | Ack data: `{}`. Added unticked, by the sender. Room gets `goal:update`, sender included |
| `goal:toggle` | client → server | `{ roomId, goalId }` | Member, on any goal. Errors: `NOT_A_MEMBER`, `GOAL_NOT_FOUND`, `ROOM_CLOSED` | Ack data: `{}`. Flips `done`. Room gets `goal:update` |
| `goal:remove` | client → server | `{ roomId, goalId }` | Member who added the goal, or the current host (any goal). Errors: `NOT_A_MEMBER`, `NOT_GOAL_AUTHOR`, `GOAL_NOT_FOUND`, `ROOM_CLOSED` | Ack data: `{}`. Room gets `goal:update` |
| `goal:update` | server → room | `{ roomId, goals: [{ id, text, done, addedBy }] }`, the full list in order. Sent before the sender's ack | Server only | n/a. Clients show their own changes before the ack and drop them when it arrives (rolled back if refused) |
| `resource:add` | client → server | Link: `{ roomId, type: 'link', title, url }`. File: `{ roomId, type: 'file', title, url, size, fileName }`, after uploading the file to storage with a signature from `POST /api/rooms/:id/uploads/sign` (see `docs/ARCHITECTURE.md` › Shared resources). `title` 1 to 80 characters, `url` http(s) only, up to 2048 characters, `size` in bytes up to 10 MB (`MAX_FILE_BYTES`), `fileName` 1 to 120 characters (`FILE_NAME_MAX`) | Member. Errors: `NOT_A_MEMBER`, `ROOM_CLOSED`, and for files `INVALID_FILE` (not an upload of ours in this room's folder, or gone), `FILE_TOO_LARGE`, `FILE_TYPE_NOT_ALLOWED` (both checked on the stored file, which is then deleted), `RESOURCE_EXISTS` (that file is already shared) | Ack data: `{ resource }`. Room gets `resource:new`, sender included, before the ack |
| `resource:new` | server → room | `{ resource: { id, roomId, userId, type, title, url, size, fileName, downloadUrl, thumbnailUrl, createdAt } }`. For links `size`, `fileName`, `downloadUrl` and `thumbnailUrl` are null. For files `size` is the stored file's real size, `downloadUrl` saves it under `fileName`, and `thumbnailUrl` is set for images only | Server only | n/a. Clients skip ids they already have |
| `resource:remove` | client → server | `{ roomId, resourceId }` | Member who shared it, or the current host (anything). Errors: `NOT_A_MEMBER`, `NOT_RESOURCE_AUTHOR`, `RESOURCE_NOT_FOUND`, `ROOM_CLOSED` | Ack data: `{}`. A file is also deleted from storage. Room gets `resource:removed` |
| `resource:removed` | server → room | `{ roomId, resourceId }` | Server only | n/a |
| `host:transfer` | client → server | `{ roomId, userId }` | Host | Ack data: `{}`. Room gets `presence:update` |
| `member:remove` | client → server | `{ roomId, userId }` | Host (not themselves) | Ack data: `{}`. The removed member's sockets leave the room. Room gets `presence:update` |
| `session:logged` | server → room | `{ roomId, session: { id, roundsCompleted, goalsDone, participants }, totalSessions, totalFocusMins }`. `participants` is how many people focused at least a minute; the totals are the room's after this session | Server only. Sent right after the `timer:state` that ends a run: the last round finishing (on its own or skipped) or `timer:reset`. Not sent for a run where nobody focused a minute | n/a |
| `lobby:subscribe` | client → server | `{}` | Any signed-in user | Ack data: `{}`. The socket joins `lobby` and gets `rooms:upsert` and `rooms:remove` from now on. Sent by pages that list public rooms (Home), again after every reconnect |
| `lobby:unsubscribe` | client → server | `{}` | Any signed-in user | Ack data: `{}`. The socket leaves `lobby` |
| `rooms:upsert` | server → `lobby` | `{ room: { id, name, subject, host: { id, name, username, avatarColor }, isPublic, maxSize, memberCount, isLive, timer: { phase, round, endsAt, pausedRemaining }, timerSettings, createdAt } }`, a `LobbyRoomCard` (the `RoomSummary` of `GET /api/rooms/public` without `hostFollowed`, which each client works out from who it follows). `isLive` is `memberCount > 0` | Server only. A public, open room was created or its card changed. At most one per room per second | n/a. Clients add the room, or update it in place |
| `rooms:remove` | server → `lobby` | `{ roomId }` | Server only. A public room closed, or its host made it private | n/a. Clients drop the card |
| `notification:new` | server → `user:<id>` | `{ notification: { id, type, roomId, text, read, createdAt } }`, where `type` is `roomStarted`, `roomFull`, `memberJoined` or `roundEnded` | Server only | n/a. Also saved to `notifications` |

**Timer commands.** Every `timer:*` command checks, in order, that this socket joined the room (`NOT_A_MEMBER`) and that the sender is the room's current host (`NOT_HOST`), on every call. Then `ROOM_CLOSED` if the room has closed, and `INVALID_TIMER_COMMAND` if the command doesn't fit the timer (for example `timer:pause` while idle). A refused command changes nothing and sends no `timer:state`. When the phase changes, everyone's status follows it (focus → Focusing, anything else → Break; Away is left alone) and the room gets `presence:update` before `timer:state`. Clients draw the countdown as `endsAt - (Date.now() + clockOffset)`, where `clockOffset = serverNow - Date.now()` when the state arrived; the server never sends ticks.

**Disconnects are not leaves.** When a user's last socket in a room drops, they keep their place (and seat) for 30 seconds (`RECONNECT_GRACE_MS`); a `room:join` in that time picks up where they were, with the same `joinedAt` and status. Their focus time stops counting while no tab is connected. After the window their focus time is saved as for `room:leave`, they're removed and the room gets `presence:update`. When the host leaves for good (leave or window expired), the longest-present member becomes host and the same `presence:update` shows the new `isHost`.

`goal:add`, `goal:toggle` and `goal:remove` are each limited to 10 per 5 seconds per socket (`GOAL_RATE_LIMIT`). `resource:add` and `resource:remove` are each limited to 5 per 10 seconds per socket (`RESOURCE_RATE_LIMIT`).

Rate limits are per socket (so per tab), in memory, and live in `apps/server/src/realtime/socketRateLimit.ts`. The wrapper applies them to every handler for those events.

## Lobby

The lobby is the Socket.IO room `lobby`: everyone looking at a list of public rooms. `apps/server/src/realtime/lobby.ts` is the only thing that sends to it: `broadcastRoomCard(io, roomId)` runs whenever something on a card changes:

- a room is created (`POST /api/rooms`)
- someone new joins
- someone leaves for good (`room:leave`, or their reconnect window ends), with any host handover that follows
- the host saves Room settings
- any `timer:state` (a pause changes the card's text and the focus and break filters)
- the cleanup job closes the room

Each send reads the room at that moment and sends `rooms:upsert` for an open public room, `rooms:remove` for a closed public one, and nothing for a private room, so **private rooms never reach the lobby**. A room going private sends `rooms:remove` at once (`removeRoomCard`).

Bursts are coalesced: **at most one `rooms:upsert` per room per second**. The first change is sent straight away; later changes inside that second become one send at the end of it, carrying the card as it is then.

The lobby isn't kept across a reconnect (the server sees a new socket), so the web client sends `lobby:subscribe` again on every connect and refetches the list once (`GET /api/rooms/public`) to pick up anything it missed while offline.

## Not covered by the spec yet

These need a decision before Phase 4. Until then there is no event for them:

- Closing the room straight away (a host control in the spec) has no event.
- `room:removed` is defined and handled by the client, but nothing sends it until `member:remove` is built in Phase 4.
