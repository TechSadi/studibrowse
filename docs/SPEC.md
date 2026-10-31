# StudiBrowse: final product spec

Status: final for version 1. Source: https://claude.ai/artifact/3oZ6kYQxndFQWHzqYGcxEh (exported 2026-10-31). If this file and the code disagree, this file wins.

## What StudiBrowse is

StudiBrowse is a real-time web app where anyone online can study together with other people. You open a study room, share the link (or leave it public), and everyone in the room focuses on one shared Pomodoro timer. People in the same room can study completely different things. The point is showing up together and keeping each other going. Subjects don't need to match.

**Who it's for:** anyone online who studies, including university and school students, self-learners, and people preparing for exams or certifications.

**The promise:** *Study with people, not alone.*

**What makes it different:**

- **No matching or scheduling.** You open a room or jump into one that's already running.
- **One clock for everyone.** The host runs the timer, and every person sees the same countdown, live.
- **Rooms are temporary, people are not.** Rooms close when they empty, so you follow people instead. When someone you follow opens a room, you get a notification.
- **Progress that adds up.** Every round you finish counts toward your weekly goal and your streak.

## How it works

1. **Sign up.** An account is required to join any room. Sign up with Google or email, then do a quick 3-step onboarding.
2. **Find or open a room.** Pick a live room on Home (rooms opened by people you follow come first), open an invite link, or create your own room. When you create a room, you're the host.
3. **Focus together.** The host starts the shared timer. Everyone's status switches to Focusing, and each person shows a short "working on" note next to their name.
4. **Talk in the breaks.** Chat and share links and files, mostly during breaks. Tick off room goals together.
5. **Wrap up.** When you leave, a session summary shows your focus time, rounds and goals. Your hours and streak update on Progress.
6. **Come back.** Rooms close 5 minutes after the last person leaves. Follow the people you studied with so you hear when they open the next room.

## Product decisions

- Open to anyone online, but every person needs their own account to join a room. There are no guest users.
- Text chat only at launch. Voice and video come later.
- The person who creates a room is its host. The host runs the timer and controls the room.
- No matching of people or subjects. People join by invite link or from the public list.
- Rooms hold up to 20 people.
- Rooms close when empty, after a 5-minute grace period so a refresh or dropped connection doesn't end the room. Chat, goals and resources are deleted with the room. The session log stays in each person's history.
- People follow people, not rooms.
- The look is a green "Reading Room" theme with light and dark modes. It follows the device setting by default, and people can switch it with the sun/moon button or in Settings > Appearance.

## Design

The design is finished and covers every screen in version 1.

- Interactive mockup (every screen clickable, with an All screens picker): `docs/design/studibrowse-mockup.html` (online: https://claude.ai/artifact/Wu34h9nEXQKdARr5JYpCRi)
- Claude Design canvas (every screen, desktop and phone): https://claude.ai/artifact/YH9wNTvG5yTKsr3NoAWkTp
- How to read the mockup, routes and tokens: `docs/design/DESIGN-NOTES.md`

**Visual style:**

| Token | Dark mode | Light mode | Used for |
| --- | --- | --- | --- |
| Background | #0b1210 | #f4f6f5 | Page |
| Surfaces | #121b18, #16211d | #ffffff, #f6f8f7 | Cards, panels, sidebar |
| Lines | #1f2c27 | #e1e7e4 | Borders and dividers |
| Text | #ecf2ef | #121a17 | Main text |
| Muted text | #8fa19a | #5f6d68 | Secondary text |
| Accent | #4cbf98 | #1d6b57 | Primary buttons, timer ring, active states |
| Live / good | #55c993 | #1a7f52 | Live badges, pulsing live dots, positive changes |
| Brass | #e0a95a | #a86c1c | Streaks and the host badge |
| Break | #7cb7ff | #2f6fd0 | Break phase on the timer and statuses |
| Display font | Bricolage Grotesque | same | Headings and big numbers |
| Body font | Hanken Grotesk | same | All other text |
| Mono font | JetBrains Mono | same | Timer, durations, counts |

**Layout rules:**

- Signed-in pages use a **left sidebar**: Home, Your progress, Notifications, Settings, People you follow (name plus a green live dot only), a streak card, and your profile. There's no Create button in the sidebar. On phones the sidebar becomes a bottom tab bar (Home, Create, Progress, Settings).
- The **focus room is distraction-free**: no sidebar, the timer in the centre, and chat, goals, people and files in one side panel. On phones that panel opens from a small dock.
- **One main action per screen.** Content stays roomy, with at most 3 room cards per row.
- Room cards show a subject tile, a green pulsing **Live** badge and a people count (for example 14/20).
- Logo: keep the current open-book logo from the mockup.

## Screens

| Screen | What it's for | What's on it |
| --- | --- | --- |
| Welcome | Explain the app to visitors | Hero ("Study with people, not alone.") with sign-up buttons and a live-room preview card beside it, a faint dot-pattern background, How it works (3 steps), 6 feature cards, and a final call to action |
| Sign up | Create an account | Google button, name, username (live availability check), email, password with a strength meter, terms checkbox |
| Log in | Get back in | Google button, email or username, password with show/hide, keep me logged in, forgot password link |
| Forgot password | Reset access | Email field, then a "Check your inbox" confirmation with a resend option |
| Onboarding | Set up a new account in 3 steps | 1. Avatar colour, what you study, subjects. 2. Weekly goal (5, 10, 15 or 20 hours) and default timer. 3. Follow suggested people |
| Invite link | Preview a room before joining | Who invited you, room name, live status, people count, current phase and time left, room goals, "Sign up to join" |
| Room closed | Handle a dead link | Explains the room ended, a Follow button for the host, and links to live rooms or creating your own |
| Home | Start a session | Top bar with search and notifications, greeting, join-by-link box, Create a room, hero with a "Happening now" timer card, Your focus this week chart, Rooms worth joining (live rooms, people you follow first, with filters), recent sessions |
| Focus room | Study together | Shared timer with phase, round and controls (host only), timer settings summary, your "working on" note and status, people in the room, and a side panel with Chat, Goals, People and Files |
| Create a room (dialog) | Open a new room | Name, subject, size (2 to 20), public or private, timer settings, auto-start, room goals. The host's Room settings uses the same dialog |
| Session summary (dialog) | Close the loop when you leave | Focus time, rounds, goals done, weekly goal progress, Back to home or Rejoin |
| Progress | See your study over time | This week vs goal, streak, sessions, focus time by day chart, session history table |
| Notifications | Everything that happened | All, Unread and Rooms opened filters, grouped Today and Earlier, a Join button on room alerts |
| Profile | See another person | Cover, avatar, name, username, Follow and Share, "Hosting now" with Join, stats, recent rooms, about, followers |
| Settings | Manage your account | Account details, appearance (System, Light or Dark), notification toggles, timer defaults and weekly goal, privacy, log out and delete account |

## User flows

1. **New visitor.** Welcome > Sign up > Onboarding (3 steps) > Home.
2. **Invited friend.** Invite link > Sign up to join (or log in) > straight into the room.
3. **Hosting.** Home > Create a room > the focus room opens with you as host > copy the invite > start the timer.
4. **Joining.** Home > Rooms worth joining (or a "someone you follow opened a room" notification) > Join room.
5. **Studying.** The timer runs for everyone. Set your status and "working on" note. Chat and share in the breaks, and tick off goals.
6. **Leaving.** Leave > session summary > Home. Progress updates, and the room closes 5 minutes after it empties.
7. **Coming back.** Follow people from a profile, the Room closed page or onboarding, then get notified when they open a room.

## Version 1 features

| Area | What a person can do | Real-time? |
| --- | --- | --- |
| Accounts | Sign up with Google or email, log in, reset password, 3-step onboarding, edit profile and settings | No |
| Rooms | Create a room with any name and an optional subject, choose public or private, set a size (up to 20), share an invite link. Rooms close 5 minutes after the last person leaves | Live list |
| Room goals | Host and members add up to 10 goals and tick them off | Yes |
| Host controls | Edit room settings, remove someone, hand over the host role, close the room. If the host leaves, the role passes to the longest-present member | Yes |
| Shared timer | Host starts, pauses, skips or resets it. Focus 5 to 90 minutes, short and long breaks, rounds, auto-start | Yes |
| Live participants | See who's in the room, each person's "working on" note and how long they've been focusing | Yes |
| Study status | Focusing, Break or Away, set by the timer or by hand | Yes |
| Room chat | Text messages with typing indicators. Recent history loads when you join | Yes |
| Shared resources | Post links and files (PDFs and images up to 10 MB) | Yes |
| Following | Follow people from profiles, onboarding or the Room closed page | No |
| Session tracking | Each finished run is logged per room, and you see a summary when you leave | Yes |
| Personal progress | Hours this week vs your goal, streak, daily chart, history | No |
| Notifications | In-app bell, a Notifications page and browser notifications when someone you follow opens a room, your room fills up, someone joins your room, or a round ends | Yes |
| Polish | Light and dark mode, works on phones, reconnects automatically, end-of-round sound, respects reduced motion | Yes |

**Left for later (do not build in v1):** voice, video and screen share (WebRTC); direct messages; scheduled and recurring rooms with reminders; email notifications; reporting and moderation queues for public rooms; ambient sounds, badges and leaderboards; an AI study helper.

## Architecture

A single Node.js server runs both the Express API and Socket.IO. That keeps the MVP simple: one codebase and one deploy. Add Redis only when more than one server is needed.

```
React client (Vite)  --REST /api-->       Node server (Express + Socket.IO)  -->  MongoDB
                     <--WebSocket-->                                         -->  Cloudinary (files)
```

REST handles everything that's requested once (login, profiles, room lists, history). Socket.IO handles everything that changes live inside a room.

**The one rule that matters most: the server owns the timer.** Store `endsAt` (a timestamp) on the room, not a countdown. Each client works out the time left as `endsAt - now` and redraws locally. That way timers never drift, the server never sends a tick every second, and someone who joins late gets the correct time instantly.

**Data models (MongoDB collections):**

| Collection | Key fields | Notes |
| --- | --- | --- |
| users | name, email, passwordHash or googleId, avatarUrl, weeklyGoalMins, streak, lastStudiedAt, following, notificationPrefs | Update the streak when a session is logged |
| rooms | name, subject, description, hostId, isPublic, inviteCode, maxSize (20), emptySince, goals [{ text, done, addedBy }], timerSettings { focusMins, shortBreakMins, longBreakMins, roundsBeforeLong, totalRounds, autoStart }, timer { phase, round, endsAt, pausedRemaining }, totalSessions, totalFocusMins | `timer` is the source of truth. A cleanup job deletes the room, its messages and resources once emptySince is more than 5 minutes old |
| sessions | roomId, roomName, startedAt, endedAt, participants [{ userId, focusedMins }], goalsDone, roundsCompleted | One per finished timer run; this powers room tracking and Progress |
| messages | roomId, userId, text, createdAt | Index on roomId + createdAt; load the last 50 on join |
| resources | roomId, userId, type (link or file), title, url, size, createdAt | Store files in Cloudinary or S3, and only the URL in MongoDB |
| notifications | userId, type, roomId, text, read, createdAt | Feeds the in-app bell |

**Socket.IO events:**

| Event | Direction | What it does |
| --- | --- | --- |
| room:join / room:leave | client > server | Joins the Socket.IO room and returns the current timer, members, goals, resources and recent chat |
| presence:update | server > room | Who is in the room, their status and their "working on" note |
| status:set | client > server | Changes your own status or note |
| chat:send / chat:new | both | Sends a message, saves it, then broadcasts it to the room |
| chat:typing | both | Shows who is typing |
| timer:start / pause / skip / reset | client > server | Host only; the server updates `endsAt` |
| timer:state | server > room | New phase, round and `endsAt` for everyone |
| goal:add / goal:toggle / goal:remove | client > server | Changes a room goal; broadcast as goal:update |
| resource:add / resource:new | both | Saves a link or file and broadcasts it |
| host:transfer / member:remove | client > server | Host controls |
| session:logged | server > room | Last round finished; updated room totals |
| notification:new | server > user | Room started, room full, someone joined, round ended |

Authenticate sockets by passing the JWT in the handshake (`io(url, { auth: { token } })`) and checking it in `io.use()`. For version 1, presence lives in memory on the server. Send each user's notifications to a private Socket.IO room named after their user id, and save them to the notifications collection so the bell still works after a reload.

## Build plan

Build it in four phases (plus a setup phase). Each phase ends with something you can demo, and every screen should match the mockup.

1. **Foundations.** React (Vite) client and Express API, MongoDB, design tokens and fonts, Welcome, Sign up, Log in, Forgot password and onboarding with JWT auth. The sidebar layout, then room creation with settings and invite links.
2. **Live rooms.** Socket.IO: joining and leaving, the live participant list, study status, chat, and the host-driven shared timer. The focus room and the invite-link preview. This is the core demo.
3. **Room tools and tracking.** Room goals, shared resources with file upload, session logging, the session summary, the Progress page, and the Room closed page with cleanup of empty rooms.
4. **People, notifications and launch.** Following, profiles, the notifications bell, the Notifications page, browser notifications, host controls, and Settings. Deploy the client to Vercel and the server to Render or Railway, which both support WebSockets.
