# Socket.IO events

Every real-time event, from the spec's Socket.IO events section (`docs/SPEC.md`). Event names and payload types live in `packages/shared/src/events.ts`; update this file in the same change as that file.

The payloads below are a draft. The spec names the events but not their fields, so the fields come from the spec's data models. They become final when Phase 2 adds the zod schemas.

**Rules for every client → server event:** the socket is authenticated in the handshake (`io.use()`). The handler validates the payload with the shared zod schema and checks permissions before doing anything, then calls the ack with `{ ok: true, ... }` or `{ error: { code, message } }`. "Member" means the sender has joined that room.

| Event | Direction | Payload | Who may send it | Response |
| --- | --- | --- | --- | --- |
| `room:join` | client → server | `{ roomId }` | Any signed-in user, while the room is open and has fewer than 20 members | Ack: `{ room, timer, members, goals, resources, messages }` (last 50 messages). Room gets `presence:update` |
| `room:leave` | client → server | `{ roomId }` | Member | Ack: `{ ok }`. Room gets `presence:update`. If the room is now empty, the 5-minute grace starts |
| `presence:update` | server → room | `{ roomId, members: [{ userId, name, avatarUrl, status, workingOn, isHost, joinedAt, focusingSince }] }` | Server only | n/a |
| `status:set` | client → server | `{ roomId, status?: 'focusing' \| 'break' \| 'away', workingOn? }` | Member (own status only) | Ack: `{ ok }`. Room gets `presence:update` |
| `chat:send` | client → server | `{ roomId, text }` | Member | Ack: `{ message }`. Saved, then room gets `chat:new` |
| `chat:new` | server → room | `{ message: { id, roomId, userId, text, createdAt } }` | Server only | n/a |
| `chat:typing` | both | Client: `{ roomId, isTyping }`. Server: `{ roomId, userId, isTyping }` | Member | No ack. Sent to the rest of the room |
| `timer:start` | client → server | `{ roomId }` | Host | Ack: `{ ok }`. Room gets `timer:state` |
| `timer:pause` | client → server | `{ roomId }` | Host | Ack: `{ ok }`. Room gets `timer:state` |
| `timer:skip` | client → server | `{ roomId }` | Host | Ack: `{ ok }`. Room gets `timer:state` |
| `timer:reset` | client → server | `{ roomId }` | Host | Ack: `{ ok }`. Room gets `timer:state` |
| `timer:state` | server → room | `{ roomId, timer: { phase, round, endsAt, pausedRemaining } }` | Server only | n/a |
| `goal:add` | client → server | `{ roomId, text }` | Member (at most 10 goals per room) | Ack: `{ ok }`. Room gets `goal:update` |
| `goal:toggle` | client → server | `{ roomId, goalId }` | Member | Ack: `{ ok }`. Room gets `goal:update` |
| `goal:remove` | client → server | `{ roomId, goalId }` | Member | Ack: `{ ok }`. Room gets `goal:update` |
| `goal:update` | server → room | `{ roomId, goals: [{ id, text, done, addedBy }] }` | Server only | n/a |
| `resource:add` | client → server | `{ roomId, type: 'link' \| 'file', title, url, size? }` (files are uploaded over REST first, max 10 MB) | Member | Ack: `{ resource }`. Room gets `resource:new` |
| `resource:new` | server → room | `{ resource: { id, roomId, userId, type, title, url, size, createdAt } }` | Server only | n/a |
| `host:transfer` | client → server | `{ roomId, userId }` | Host | Ack: `{ ok }`. Room gets `presence:update` |
| `member:remove` | client → server | `{ roomId, userId }` | Host (not themselves) | Ack: `{ ok }`. The removed member's sockets leave the room. Room gets `presence:update` |
| `session:logged` | server → room | `{ roomId, session: { id, roundsCompleted, goalsDone, participants }, totalSessions, totalFocusMins }` | Server only | n/a |
| `notification:new` | server → `user:<id>` | `{ notification: { id, type, roomId, text, read, createdAt } }`, where `type` is room started, room full, someone joined or round ended | Server only | n/a. Also saved to `notifications` |

## Not covered by the spec yet

These need a decision before Phase 2 or 4. Until then there is no event for them:

- Editing room settings and closing the room (both host controls in the spec) have no event.
- What a removed member's client receives (for example a `member:removed` event to that user) is not defined.
