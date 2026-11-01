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
| `room:join` | client → server | `{ roomId }` | Any signed-in user, while the room is open and has fewer than 20 members | Ack data: `{ room, members, resources, messages }`. `room` is the `RoomDetail` and already holds the timer and goals; `messages` is the last 50, oldest first. Room gets `presence:update` |
| `room:leave` | client → server | `{ roomId }` | Member | Ack data: `{}`. Room gets `presence:update`. If the room is now empty, the 5-minute grace starts |
| `presence:update` | server → room | `{ roomId, members: [{ userId, name, username, avatarColor, status, workingOn, isHost, joinedAt, focusingSince }] }` | Server only | n/a |
| `status:set` | client → server | `{ roomId, status?: 'focusing' \| 'break' \| 'away', workingOn? }`. At least one of the two; `workingOn` is trimmed, up to 80 characters, and `''` clears it | Member (own status only) | Ack data: `{}`. Room gets `presence:update` |
| `chat:send` | client → server | `{ roomId, text }`. `text` is trimmed, 1 to 500 characters | Member. 5 per 5 seconds per socket | Ack data: `{ message }`. Saved, then room gets `chat:new` |
| `chat:new` | server → room | `{ message: { id, roomId, userId, text, createdAt } }` | Server only | n/a |
| `chat:typing` | both | Client: `{ roomId, isTyping }`. Server: `{ roomId, userId, isTyping }` | Member. 10 per 5 seconds per socket | No ack. Sent to the rest of the room |
| `timer:start` | client → server | `{ roomId }` | Host | Ack data: `{}`. Room gets `timer:state` |
| `timer:pause` | client → server | `{ roomId }` | Host | Ack data: `{}`. Room gets `timer:state` |
| `timer:skip` | client → server | `{ roomId }` | Host | Ack data: `{}`. Room gets `timer:state` |
| `timer:reset` | client → server | `{ roomId }` | Host | Ack data: `{}`. Room gets `timer:state` |
| `timer:state` | server → room | `{ roomId, timer: { phase, round, endsAt, pausedRemaining } }` | Server only | n/a |
| `goal:add` | client → server | `{ roomId, text }`. `text` is trimmed, 1 to 80 characters | Member (at most 10 goals per room) | Ack data: `{}`. Room gets `goal:update` |
| `goal:toggle` | client → server | `{ roomId, goalId }` | Member | Ack data: `{}`. Room gets `goal:update` |
| `goal:remove` | client → server | `{ roomId, goalId }` | Member | Ack data: `{}`. Room gets `goal:update` |
| `goal:update` | server → room | `{ roomId, goals: [{ id, text, done, addedBy }] }` | Server only | n/a |
| `resource:add` | client → server | Link: `{ roomId, type: 'link', title, url }`. File: `{ roomId, type: 'file', title, url, size }` (uploaded over REST first, `size` in bytes, max 10 MB). `title` 1 to 80 characters, `url` http(s) only, up to 2048 characters | Member | Ack data: `{ resource }`. Room gets `resource:new` |
| `resource:new` | server → room | `{ resource: { id, roomId, userId, type, title, url, size, createdAt } }` (`size` is null for links) | Server only | n/a |
| `host:transfer` | client → server | `{ roomId, userId }` | Host | Ack data: `{}`. Room gets `presence:update` |
| `member:remove` | client → server | `{ roomId, userId }` | Host (not themselves) | Ack data: `{}`. The removed member's sockets leave the room. Room gets `presence:update` |
| `session:logged` | server → room | `{ roomId, session: { id, roundsCompleted, goalsDone, participants }, totalSessions, totalFocusMins }` | Server only | n/a |
| `notification:new` | server → `user:<id>` | `{ notification: { id, type, roomId, text, read, createdAt } }`, where `type` is `roomStarted`, `roomFull`, `memberJoined` or `roundEnded` | Server only | n/a. Also saved to `notifications` |

Rate limits are per socket (so per tab), in memory, and live in `apps/server/src/realtime/socketRateLimit.ts`. The wrapper applies them to every handler for those events.

## Not covered by the spec yet

These need a decision before Phase 2 or 4. Until then there is no event for them:

- Editing room settings and closing the room (both host controls in the spec) have no event.
- What a removed member's client receives (for example a `member:removed` event to that user) is not defined.
