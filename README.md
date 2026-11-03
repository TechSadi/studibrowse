<p align="center">
  <img src="apps/web/src/assets/logo/logo.svg" alt="StudiBrowse logo" width="64" height="64" />
</p>

<h1 align="center">StudiBrowse</h1>

<p align="center"><strong>Study with people, not alone.</strong></p>

StudiBrowse is a real-time web app where anyone online opens or joins a study room and focuses with other people on one shared Pomodoro timer. People in the same room can study completely different things. The point is showing up together and keeping each other going.

- **No matching or scheduling.** Open a room or jump into one that's already running.
- **One clock for everyone.** The host runs the timer, and everyone sees the same countdown, live.
- **Rooms are temporary, people are not.** Rooms hold up to 20 people and close 5 minutes after the last person leaves. You follow people, and get notified when someone you follow opens a room.
- **Progress that adds up.** Every round you finish counts toward your weekly goal and your streak.

## Features (v1)

| Area             | What you can do                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Accounts         | Sign up with Google or email, log in, reset your password, 3-step onboarding, edit your profile and settings     |
| Rooms            | Create a public or private room (2 to 20 people), share an invite link, browse the live room list                |
| Shared timer     | The host starts, pauses, skips or resets it. Focus 5 to 90 minutes, short and long breaks, rounds, auto-start    |
| Host controls    | Edit room settings, remove someone, hand over the host role, close the room                                      |
| In the room      | Live participants with "working on" notes and status (Focusing, Break, Away), chat with typing indicators, goals |
| Shared resources | Post links and files (PDFs and images up to 10 MB)                                                               |
| Following        | Follow people from profiles, onboarding or the Room closed page                                                  |
| Progress         | Session summary when you leave, hours this week vs your goal, streak, daily chart, session history               |
| Notifications    | In-app bell, a Notifications page and browser notifications                                                      |
| Polish           | Light and dark mode, works on phones, reconnects automatically, end-of-round sound, respects reduced motion      |

## Tech stack

A pnpm workspaces monorepo, TypeScript (strict) everywhere.

| Workspace                            | What it is                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`apps/web`](apps/web)               | React 18 + Vite, React Router, TanStack Query, plain CSS with design tokens and CSS Modules        |
| [`apps/server`](apps/server)         | Node 22, Express and Socket.IO 4 in one process, MongoDB via Mongoose                              |
| [`packages/shared`](packages/shared) | zod schemas, shared types, Socket.IO event names and payloads, constants used by client and server |
| [`e2e`](e2e)                         | Playwright end-to-end tests                                                                        |

**The server owns the timer.** A room stores `{ phase, round, endsAt, pausedRemaining }`; clients draw the countdown locally from `endsAt` and the server never sends per-second ticks. REST handles things requested once (auth, profiles, room lists, history) and Socket.IO handles everything live inside a room plus notifications.

## Getting started

**Requirements:** Node 22+, pnpm, and Docker (for local MongoDB).

```bash
pnpm install
cp .env.example .env      # the server exits at boot if a required variable is missing
docker compose up -d      # starts MongoDB on localhost:27017
pnpm dev                  # web on http://localhost:5173, API on http://localhost:4000
```

Vite proxies `/api` and `/socket.io` to the server, so open http://localhost:5173. Google sign-in, password reset emails, file uploads and Sentry are optional locally; see the comments in [`.env.example`](.env.example).

## Scripts

| Command                                           | What it does                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                        | Run the web app and the server together                             |
| `pnpm build`                                      | Build every workspace                                               |
| `pnpm lint`                                       | ESLint and a Prettier check                                         |
| `pnpm format`                                     | Format with Prettier                                                |
| `pnpm typecheck`                                  | Type-check every workspace                                          |
| `pnpm test`                                       | Unit, API and real-time tests (Vitest, Supertest, socket.io-client) |
| `pnpm --filter @studibrowse/server test:coverage` | Server coverage for `modules/` and `realtime/` (80% minimum in CI)  |
| `pnpm test:e2e`                                   | Playwright end-to-end tests (starts the web and API servers itself) |
| `pnpm --filter @studibrowse/server start`         | Run the built server                                                |

Before the first e2e run, install the browser once: `pnpm --filter @studibrowse/e2e exec playwright install chromium`.

A Husky pre-commit hook runs ESLint and Prettier on staged files. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Deployment

Production runs the web app on Vercel, the API on Render and the database on MongoDB Atlas, with Sentry for errors. GitHub Actions deploys after CI passes on `main`.
