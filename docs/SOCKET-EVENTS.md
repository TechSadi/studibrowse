# Socket.IO events

Every real-time event, from the spec's Socket.IO events section (`docs/SPEC.md`). Event names, payload schemas and types live in `packages/shared/src/events.ts` (`ClientToServerEvents`, `ServerToClientEvents`, `clientEventSchemas`); the realtime entity types (`PresenceMember`, `ChatMessage`, `RoomResource`, `SessionSummary`, `AppNotification`) live in `packages/shared/src/types/realtime.ts`. Update this file in the same change as those files.

## Connecting

The client connects with `io(VITE_SOCKET_URL, { auth: { token: <access token> } })`. In development `VITE_SOCKET_URL` is empty and the socket uses the page's origin (the Vite proxy). In production the browser connects straight to the Render API origin, because Vercel can't proxy WebSockets; the token in the handshake is the only credential (no cookie), and Socket.IO's CORS allows only `CLIENT_ORIGIN`. The server's `io.use()` middleware verifies the token and stores the user id on `socket.data.userId`. A rejected handshake reaches the client's `connect_error` listener with `err.data = { code, message }`:

| Code | Meaning | What the web client does |
| --- | --- | --- |
| `UNAUTHENTICATED` | No token, not a string, bad signature, no user id | Ends the session (signed out) |
| `TOKEN_EXPIRED` | The access token expired | Refreshes once and reconnects. Expired again straight after a refresh → ends the session |
| `RATE_LIMITED` | The user already has 20 sockets open (`MAX_SOCKETS_PER_USER`) | Shows the connection as having trouble; closing other tabs and reloading fixes it |

A message over 32 KB (`MAX_SOCKET_PAYLOAD_BYTES`, Socket.IO's `maxHttpBufferSize`) closes the connection; the largest valid payload (`room:settings`) is under 4 KB.

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
| `room:join` | client → server | `{ roomId, inviteCode? }`. `inviteCode` is the 10-character code from the invite link | Any signed-in user, while the room is open and has fewer than `maxSize` people (counted by person, not tab). A private room also needs `inviteCode`, unless you're its host or already in it | Ack data: `{ room, members, resources, messages, serverNow }`. `room` is the `RoomDetail` and already holds the timer and goals; `members` is longest present first; `messages` is the last 50, oldest first; `serverNow` is the server's clock in epoch ms, for the timer's clock offset. A newcomer's status follows the timer phase. Room gets `presence:update`. Errors: `ROOM_NOT_FOUND` (missing, or private without the right code), `ROOM_CLOSED`, `REMOVED_FROM_ROOM` (the host removed you; checked before the invite code, so the code doesn't help), `ROOM_FULL` |
| `room:leave` | client → server | `{ roomId }` | Member (this socket joined the room). Error: `NOT_A_MEMBER` | Ack data: `{}`. Once all your tabs in the room have left, your focus time so far is saved to the run's session (in progress) and your streak updated, then you're removed straight away and the room gets `presence:update`. If the room now has no sockets, the 5-minute grace starts. The ack comes after that save, so the web app loads the session summary (`GET /api/sessions/mine/latest`) once it arrives |
| `room:settings` | client → server | The Create a room fields (`createRoomSchema`) plus `roomId` | Host. Errors: `NOT_A_MEMBER`, `NOT_HOST`, `ROOM_TOO_SMALL` (`maxSize` below the people already in the room), `ROOM_CLOSED` | Ack data: `{}`. Saved, then the room gets `room:update`, and `goal:update` if the goals changed. Goals are matched by text, so one that stays keeps its tick. Timer changes apply from the next phase: a running or part-run phase keeps its time, while a phase waiting for the host at its full length (it hasn't run yet) takes the new length and the room gets `timer:state`. Lowering the rounds below the current one makes this round the last |
| `room:update` | server → room | `{ roomId, settings: { name, subject, description, isPublic, maxSize, timerSettings } }` | Server only | n/a |
| `room:removed` | server → `user:<id>` | `{ roomId }` | Server only. Sent to a member the host removed (`member:remove`), to every tab of theirs, after they're out of the room | n/a. The client shows "You were removed" and doesn't rejoin |
| `room:close` | client → server | `{ roomId }` | Host. Errors: `NOT_A_MEMBER`, `NOT_HOST`, `ROOM_CLOSED` | Ack data: `{}`. In order: the timer stops and a run still going is logged with everyone's focus time so far (as when the cleanup job closes a room); the room is closed (`closedAt` set, goals emptied); the whole room, sender included, gets `room:closed`; everyone is taken out of presence and the room's channel, and any reconnect window still open is cancelled; the lobby gets `rooms:remove`; everyone's followers get `follows:live`; then the chat, resources and stored files are deleted. Invite links show Room closed from then on |
| `room:closed` | server → room | `{ roomId }` | Server only. The host closed the room | n/a. Everyone's focus time is already saved, so the client shows the session summary at once, without Rejoin, and doesn't rejoin |
| `presence:update` | server → room | `{ roomId, members: [{ userId, name, username, avatarColor, status, workingOn, isHost, joinedAt, focusingSince }] }` | Server only | n/a |
| `status:set` | client → server | `{ roomId, status?: 'focusing' \| 'break' \| 'away', workingOn? }`. At least one of the two; `workingOn` is trimmed, up to 80 characters, and `''` clears it | Member (own status only). Error: `NOT_A_MEMBER` | Ack data: `{}`. Room gets `presence:update` |
| `chat:send` | client → server | `{ roomId, text }`. `text` is trimmed, 1 to 1000 characters (`CHAT_TEXT_MAX`) | Member (`NOT_A_MEMBER` otherwise). 5 per 5 seconds per person | Ack data: `{ message }`. Saved, then the whole room gets `chat:new`, sender included |
| `chat:new` | server → room | `{ message: { id, roomId, userId, text, createdAt } }`. The sender's ack carries the same message, so clients skip ids they already have. In the history `room:join` sends, `userId` is null for a message whose author deleted their account (shown as "Deleted account") | Server only | n/a |
| `chat:typing` | both | Client: `{ roomId, isTyping }`. Server: `{ roomId, userId, isTyping }` | Member. 10 per 5 seconds per person | No ack. Sent to the rest of the room (your other tabs included). Clients send `true` at most every `TYPING_THROTTLE_MS` (2 s) and `false` when they stop; receivers clear someone after `TYPING_CLEAR_MS` (3 s) without a new event, or when their message arrives |
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
| `host:transfer` | client → server | `{ roomId, userId }`, the new host | Host, to someone else in the room (someone inside their reconnect window counts). Errors: `NOT_A_MEMBER`, `NOT_HOST`, `CANNOT_TARGET_SELF`, `MEMBER_NOT_FOUND` | Ack data: `{}`. Saved in presence and as the room's `hostId`. Room gets `presence:update` with the new `isHost`; the lobby gets the card; both people's followers get `follows:live`. The old host loses the host controls at once |
| `member:remove` | client → server | `{ roomId, userId }` | Host, on someone else in the room (someone inside their reconnect window counts). Errors: `NOT_A_MEMBER`, `NOT_HOST`, `CANNOT_TARGET_SELF`, `MEMBER_NOT_FOUND` | Ack data: `{}`. In order: they're added to the room's `removedUserIds`, so they can't join again while the room exists; every tab of theirs leaves the room's channel; their focus time so far is saved (as for `room:leave`) and they're taken out of presence, their reconnect window cancelled; the room gets `presence:update`, the lobby the card and their followers `follows:live`; then they get `room:removed` |
| `session:logged` | server → room | `{ roomId, session: { id, roundsCompleted, goalsDone, participants }, totalSessions, totalFocusMins }`. `participants` is how many people focused at least a minute; the totals are the room's after this session | Server only. Sent right after the `timer:state` that ends a run: the last round finishing (on its own or skipped) or `timer:reset`. Not sent for a run where nobody focused a minute | n/a |
| `lobby:subscribe` | client → server | `{}` | Any signed-in user | Ack data: `{}`. The socket joins `lobby` and gets `rooms:upsert` and `rooms:remove` from now on. Sent by pages that list public rooms (Home), again after every reconnect |
| `lobby:unsubscribe` | client → server | `{}` | Any signed-in user | Ack data: `{}`. The socket leaves `lobby` |
| `rooms:upsert` | server → `lobby` | `{ room: { id, name, subject, host: { id, name, username, avatarColor }, isPublic, maxSize, memberCount, isLive, timer: { phase, round, endsAt, pausedRemaining }, timerSettings, createdAt } }`, a `LobbyRoomCard` (the `RoomSummary` of `GET /api/rooms/public` without `hostFollowed`, which each client works out from who it follows). `isLive` is `memberCount > 0` | Server only. A public, open room was created or its card changed. At most one per room per second | n/a. Clients add the room, or update it in place |
| `rooms:remove` | server → `lobby` | `{ roomId }` | Server only. A public room closed, or its host made it private | n/a. Clients drop the card |
| `follows:watch` | client → server | `{}` | Any signed-in user | Ack data: `{ live: [{ userId, room: { id, name, isHost } \| null }] }`, one entry per person you follow. The socket now watches exactly the people you follow (read from the database, not the client) and gets `follows:live` about them. Sent on every connect and after following or unfollowing someone |
| `follows:live` | server → `watch:<userId>` | `{ userId, room: { id, name, isHost } \| null }` | Server only. Someone you follow joined or left a room, a room they're in changed name or went public or private, or they became its host | n/a. The sidebar shows or clears their live dot |
| `notification:new` | server → `user:<id>` | `{ notification: { id, type, roomId, roomName, text, read, createdAt } }`, where `type` is `roomStarted`, `roomFull`, `memberJoined` or `roundEnded`. `text` is the headline ("Maya Kapoor opened a room"); `roomName` goes on the detail line | Server only. `roomStarted` → the host's followers, public rooms only. `memberJoined` and `roomFull` → the room's current host. `roundEnded` → everyone in the room. Each respects the recipient's `notificationPrefs`, and nobody hears about a private room they're not in | n/a. Saved to `notifications` first. Joins within a minute are grouped: the same notification is sent again, **same id**, with new text, so clients replace it. See `docs/ARCHITECTURE.md` › Notifications |

**Host controls.** `room:settings`, `member:remove`, `host:transfer` and `room:close` check, on every call and in this order, that this socket joined the room (`NOT_A_MEMBER`) and that the sender is the room's current host in presence (`NOT_HOST`). A refused command changes nothing and sends nothing.

**Timer commands.** Every `timer:*` command checks, in order, that this socket joined the room (`NOT_A_MEMBER`) and that the sender is the room's current host (`NOT_HOST`), on every call. Then `ROOM_CLOSED` if the room has closed, and `INVALID_TIMER_COMMAND` if the command doesn't fit the timer (for example `timer:pause` while idle). A refused command changes nothing and sends no `timer:state`. When the phase changes, everyone's status follows it (focus → Focusing, anything else → Break; Away is left alone) and the room gets `presence:update` before `timer:state`. Clients draw the countdown as `endsAt - (Date.now() + clockOffset)`, where `clockOffset = serverNow - Date.now()` when the state arrived; the server never sends ticks.

**Disconnects are not leaves.** When a user's last socket in a room drops, they keep their place (and seat) for 30 seconds (`RECONNECT_GRACE_MS`); a `room:join` in that time picks up where they were, with the same `joinedAt` and status. Their focus time stops counting while no tab is connected. After the window their focus time is saved as for `room:leave`, they're removed and the room gets `presence:update`. When the host leaves for good (leave or window expired), the longest-present member becomes host and the same `presence:update` shows the new `isHost`.

## Rate limits

Every client event is rate limited **per user**: all of someone's tabs and devices share one budget, and reconnecting doesn't reset it. Limits are in memory (one server process in v1) and live in `apps/server/src/realtime/socketRateLimit.ts`; the handler wrapper applies them before validation, so a handler can't forget one. Over the limit an event acks `RATE_LIMITED` (`chat:typing` is dropped).

| Events | Limit | Constant |
| --- | --- | --- |
| `chat:send` | 5 per 5 s | `CHAT_RATE_LIMIT` |
| `chat:typing` | 10 per 5 s | `TYPING_RATE_LIMIT` |
| `goal:add`, `goal:toggle`, `goal:remove` | each 10 per 5 s | `GOAL_RATE_LIMIT` |
| `resource:add`, `resource:remove` | each 5 per 10 s | `RESOURCE_RATE_LIMIT` |
| `room:join`, `room:leave` | each 20 per 10 s | `ROOM_MEMBERSHIP_RATE_LIMIT` |
| `status:set` | 10 per 5 s | `STATUS_RATE_LIMIT` |
| `timer:start`, `timer:pause`, `timer:skip`, `timer:reset` | 20 per 10 s, shared | `TIMER_RATE_LIMIT` |
| `room:settings`, `room:close`, `host:transfer`, `member:remove` | each 10 per 10 s | `HOST_ACTION_RATE_LIMIT` |
| `follows:watch` | 10 per 10 s | `FOLLOWS_WATCH_RATE_LIMIT` |
| `lobby:subscribe`, `lobby:unsubscribe` | 20 per 10 s, shared | `LOBBY_RATE_LIMIT` |

## Lobby

The lobby is the Socket.IO room `lobby`: everyone looking at a list of public rooms. `apps/server/src/realtime/lobby.ts` is the only thing that sends to it: `broadcastRoomCard(io, roomId)` runs whenever something on a card changes:

- a room is created (`POST /api/rooms`)
- someone new joins
- someone leaves for good (`room:leave`, or their reconnect window ends), with any host handover that follows
- the host removes someone (`member:remove`) or hands over the host role (`host:transfer`)
- the host saves Room settings
- the host closes the room (`room:close`)
- any `timer:state` (a pause changes the card's text and the focus and break filters)
- the cleanup job closes the room

Each send reads the room at that moment and sends `rooms:upsert` for an open public room, `rooms:remove` for a closed public one, and nothing for a private room, so **private rooms never reach the lobby**. A room going private sends `rooms:remove` at once (`removeRoomCard`).

Bursts are coalesced: **at most one `rooms:upsert` per room per second**. The first change is sent straight away; later changes inside that second become one send at the end of it, carrying the card as it is then.

The lobby isn't kept across a reconnect (the server sees a new socket), so the web client sends `lobby:subscribe` again on every connect and refetches the list once (`GET /api/rooms/public`) to pick up anything it missed while offline.

## Following

Each socket that sent `follows:watch` is in a Socket.IO room `watch:<userId>` for every person its user follows. `realtime/followPresence.ts` sends `follows:live` there when that person's public-room presence may have changed:

- they join a room for the first time (`room:join`, not another tab), or leave it for good (`room:leave`, or the reconnect window running out);
- the host leaves and someone else becomes host, or the host hands the role over (sent for both people);
- the host removes them from a room, or closes a room they're in;
- the host saves Room settings (sent for everyone in the room, so a name change or going private reaches their followers).

Each send reads presence and the database at that moment and reports the first **open public** room the person is in, or `room: null`. A private room is reported as `null`, so **following someone never reveals a private room**. Sends for one person are queued, so a quick join then leave can't arrive out of order. Like the lobby, watching isn't kept across a reconnect; the client watches again on every connect.
