# StudiBrowse

A real-time web app where anyone online opens or joins a study room and focuses with other people on one shared Pomodoro timer. Rooms hold up to 20 people, are temporary (they close 5 minutes after the last person leaves), and people follow people, not rooms.

## Source of truth

- Product spec: `docs/SPEC.md`. If the code and the spec disagree, the spec wins. Ask before changing behaviour the spec defines.
- Design: `docs/design/studibrowse-mockup.html` (every screen, light and dark) and `docs/design/DESIGN-NOTES.md`. Every screen must match the mockup: layout, spacing, type, colours, copy and states. Rebuild it as React components; never paste the mockup's HTML or its inline script.
- Architecture: `docs/ARCHITECTURE.md`. Socket events: `docs/SOCKET-EVENTS.md`. Update both in the same change whenever you change what they describe.

## Stack

- pnpm workspaces monorepo, TypeScript everywhere (strict mode).
- `apps/web`: React 18 + Vite, React Router, TanStack Query, plain CSS with variables (`src/styles/tokens.css`) + CSS Modules. No Tailwind, no component library.
- `apps/server`: Node 22 + Express + Socket.IO 4 in one process, Mongoose for MongoDB.
- `packages/shared`: zod schemas, shared types, Socket.IO event names and payload types, constants. Client and server both import from here; never duplicate a type or an event name.
- Tests: Vitest (unit), Supertest (API), socket.io-client (real-time), Playwright (e2e in `/e2e`).

## Commands

- First run: `pnpm install`, then `cp .env.example .env` (the server reads `.env` from the repo root and exits at boot if a variable is missing).
- `pnpm dev` runs web (5173) and server (4000) together. `docker compose up -d` starts local MongoDB. Vite proxies `/api` and `/socket.io` to the server.
- `pnpm lint` (ESLint + Prettier check), `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm build`. `pnpm --filter @studibrowse/server start` runs the built server.
- `pnpm test:e2e` runs Playwright (`/e2e`) against the Vite dev server, which it starts itself. Run `pnpm --filter @studibrowse/e2e exec playwright install chromium` once first.
- A Husky pre-commit hook runs lint-staged (ESLint --fix + Prettier on staged files). Don't bypass it with `--no-verify`.
- `packages/shared` ships TypeScript source (no build step). Vite bundles it for the web app and tsup bundles it into `apps/server/dist`.
- Before you say a task is done, run `pnpm lint && pnpm typecheck && pnpm test` and fix every failure. Never skip, delete or weaken a test to make it pass.

## Architecture rules

- **The server owns the timer.** A room stores `timer { phase, round, endsAt, pausedRemaining }`. Clients compute `endsAt - now` and redraw locally. The server never sends per-second ticks. Only the host can send timer commands; the server checks this every time.
- REST for things requested once (auth, profiles, room lists, history). Socket.IO for everything live inside a room and for notifications.
- Sockets authenticate with the JWT in the handshake (`io(url, { auth: { token } })`), checked in `io.use()`. Every handler validates its payload with the shared zod schema and checks permissions (member of the room? host?) before doing anything.
- Each user has a private Socket.IO room `user:<id>` for notifications. Presence lives in memory in v1.
- Server code is organised by feature in `src/modules/<feature>/` (routes, controller, service, tests). Routes stay thin; logic lives in services; services never touch `req`/`res`.
- Errors go through one error handler that returns `{ error: { code, message } }`. Never leak stack traces or internal messages to the client.
- Config comes only from `src/config/env.ts`, which validates env vars with zod at boot. Never read `process.env` anywhere else. Never commit secrets; add every new variable to `.env.example`.

## Frontend rules

- Feature folders in `src/features/<feature>/`. Shared UI pieces in `src/components/ui/`. Reuse an existing component before writing a new one.
- Use design tokens (CSS variables) for every colour, radius, shadow and font. No hex values in components.
- Light and dark mode: follows the device by default; the sun/moon button and Settings › Appearance (System / Light / Dark) override it, saved in localStorage as `sb-theme`, applied as `data-theme` on `<html>` before first paint.
- Logo: use the current open-book logo from the mockup (the `i-logo` symbol), exported to `src/assets/logo/`. Do not redesign it.
- Every screen handles loading, empty and error states, works at phone width (375px), is keyboard accessible, and respects `prefers-reduced-motion`.
- Fonts: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (timer, durations, counts).

## How to work

- Plan before coding on anything bigger than a small fix, and keep each change focused on one feature.
- Write tests with the feature, not after. Timer logic, permissions and room lifecycle must have unit tests.
- Use clear names, small functions, and comments only where the why isn't obvious.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- If something in the spec is unclear or seems wrong, stop and ask instead of guessing.
- Don't add libraries without saying why; prefer what is already installed.
