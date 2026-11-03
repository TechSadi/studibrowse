# Security and robustness pass

**Date:** 2026-11-03, on `phase-4` (after 4.4 Settings), before the first production deploy.
**Scope:** the whole app: every REST route, every socket handler, the shared schemas, the web client, configuration and dependencies.
**Method:** read every route, handler, service and serializer by hand, against the checklist below; ran `pnpm audit`; fixed what was found; then ran `/security-review` over the branch and the fixes.

## Deployment model

The rest of this document assumes the production setup in `docs/SPEC.md`: the web app on **Vercel**, the API on **Render**.

```
REST:      browser ──https──▶ Vercel (static app + rewrite /api/*) ──https──▶ Render proxy ──▶ Express
Socket.IO: browser ──wss────────────────────────────────────────────▶ Render proxy ──▶ Socket.IO
```

- **REST goes through Vercel's `/api/*` rewrite** (`apps/web/vercel.json`), so for the browser the API is on the same origin as the page.
  - The refresh cookie stays first-party (`httpOnly; Secure; SameSite=Lax; Path=/api/auth`). A cross-site page can't make the browser send it on a POST, so the cookie endpoints need no CSRF token.
  - Pages on other origins can't read API responses: CORS allows only `CLIENT_ORIGIN`.
- **Socket.IO connects straight to Render** (`VITE_SOCKET_URL`), because Vercel can't proxy WebSockets.
  - The only credential is the access token in the handshake (`io(url, { auth: { token } })`), never a cookie. That means cross-site WebSocket hijacking has nothing to ride on.
  - Socket.IO's CORS allows only `CLIENT_ORIGIN`.

## Checklist

| Area | Status | Where |
| --- | --- | --- |
| Every REST body, query and param validated | ✅ Already the case | `validateBody/Query/Params` with shared zod schemas. Writes use strict objects, so unknown fields are refused |
| Every socket payload validated | ✅ Already the case | The `realtime/handler.ts` wrapper parses with `clientEventSchemas` before any handler runs |
| Auth on every non-public route | ✅ Already the case | `requireAuth` on everything except auth, health, the invite preview and the username check |
| Socket handshake auth | ✅ Already the case | `io.use(socketAuth)`: HS256 only, `sub` must be an ObjectId |
| Permissions on every socket event | ✅ Already the case | `requireSocketInRoom` / `requireHost` from presence, checked on every call. Services check membership, author or host |
| Room privacy | ✅ Already the case | Private rooms give the same 404 as missing ones. They don't appear in lobby cards, followers' live dots, notifications or profiles for people who weren't in them |
| Public endpoints leak no user data | ✅ Already the case | Every response is built by a serializer that copies a fixed list of fields. `passwordHash` is `select: false`. The invite preview shows initials and colours only. Privacy settings are honoured |
| NoSQL injection | ✅ Already the case | No query object ever comes from the client. Ids are 24-hex regexes. Search text is regex-escaped. Cursors are decoded and type-checked |
| XSS in chat, names and links | ✅ Already the case, plus hardening | React escapes all text, and nothing uses `dangerouslySetInnerHTML`. Chat links are http(s) only (`linkify.ts`). Resource urls are http(s) only on the server and now on the client too. A CSP is added |
| Open redirect after login | ✅ Fixed | `safeNextPath` now also refuses control characters and whitespace |
| Rate limits: auth | ✅ Already the case | Per IP, plus per account for login and forgot password, and a per-account limit on wrong passwords when changing email |
| Rate limits: chat | ✅ Fixed | Was per socket, so more tabs meant a bigger budget. Now per user |
| Rate limits: uploads | ✅ Already the case | Upload signing is limited per person, and file shares per user |
| Rate limits: follows | ✅ Added | 60 follows and unfollows per person per 15 minutes |
| Rate limits: everything else | ✅ Added | Room creation, profile saves, username checks, and every socket event |
| CORS | ✅ Already the case | Only `CLIENT_ORIGIN`, for both Express and Socket.IO |
| Cookies | ✅ Already the case | `httpOnly; Secure; SameSite=Lax; Path=/api/auth`. Refresh tokens rotate, and reusing an old one revokes the whole family |
| Proxy / client IP | ✅ Fixed | `TRUST_PROXY`: without it, every visitor shared the proxy's IP bucket |
| Secrets only from env | ✅ Already the case, plus a check | `process.env` is only read in `config/env.ts`, and `.env` is gitignored. Production now refuses the example JWT secret and a non-https `CLIENT_ORIGIN` |
| Security headers | ✅ Added | The API already had helmet. The web app now gets CSP, HSTS, nosniff, Referrer-Policy and Permissions-Policy from `vercel.json` |
| Dependencies | ⚠️ Accepted | One moderate advisory, dev-only. See below |

## Changes

### Configuration (`apps/server/src/config/env.ts`, `app.ts`, `.env.example`)

- **`TRUST_PROXY`** (number of proxy hops, default 0) is passed to Express's `trust proxy`, so `req.ip` is the visitor's address.
  - The per-IP limits (signup, login, Google, forgot, reset, invite preview, username check) key on `req.ip`.
  - Behind Vercel and Render without this setting, every visitor shared one bucket, so 20 bad logins from anyone locked everyone out of auth.
  - Production value: **2** (Vercel, then Render's proxy).
  - Tests: with it set, `X-Forwarded-For` separates visitors. Without it, the header is ignored, so it can't be spoofed to dodge a limit.
- **Production boot checks:** `CLIENT_ORIGIN` must be `https://`, and `JWT_ACCESS_SECRET` must not be the `.env.example` value. Either problem stops the server at boot, like a missing variable does.

### REST rate limits (`middleware/rateLimit.ts`)

There's a new `createUserRateLimiter`, keyed by user id, which runs after `requireAuth`:

| Route | Limit | Why |
| --- | --- | --- |
| `POST /api/rooms` | 10 per person per 15 min | Each public room notifies every follower |
| `POST` / `DELETE /api/users/:id/follow` | 60 per person per 15 min, shared | Follow spam; database writes |
| `PATCH /api/users/me` | 60 per person per 15 min | Settings saves on every toggle, so this is generous |
| `GET /api/users/username-available` | 120 per IP per 15 min | A public endpoint; stops bulk probing |
| `POST /api/rooms/:id/uploads/sign` | 30 per person per 15 min | Unchanged; now uses the shared helper |

### Socket hardening (`realtime/socketRateLimit.ts`, `handler.ts`, `io.ts`)

- **Limits are per user, not per socket.** Before, each tab had its own budget, so opening 10 tabs gave you 10× the chat rate. Now every tab and device shares one budget.
  - Disconnecting no longer resets it.
  - Stale keys are pruned as the limiter runs, instead of being forgotten on disconnect.
- **Every client event is limited now**, not only chat, goals and resources. The values are in `docs/SOCKET-EVENTS.md` › Rate limits. A test checks that every event in `clientEventSchemas` has a limiter.
- **At most 20 sockets per user** (`MAX_SOCKETS_PER_USER`). Connection 21 is refused at the handshake with `RATE_LIMITED`.
- **Payloads are capped at 32 KB** (`maxHttpBufferSize`). Socket.IO's default is 1 MB; the largest valid event is under 4 KB.

### Input edge cases (`packages/shared/src/schemas/auth.ts`)

- **Passwords are capped at 72 UTF-8 bytes, not 72 characters.** bcrypt silently ignores everything past 72 bytes. A 72-character password made of accented letters or emoji is up to 288 bytes, so most of it wouldn't count. Longer ones now get "That password is too long."
- **The login identifier is capped at 254 characters**, the longest possible email. It was unbounded, and it's also the key for the per-account login limiter.

### Web (`apps/web`)

- **`vercel.json`:** the `/api` rewrite, the SPA fallback, and security headers on every response.
  - **Content-Security-Policy:**
    - Scripts: only the app's own, Google sign-in (`accounts.google.com/gsi/client`), and the inline theme script, allowed by its SHA-256 hash. There is no `'unsafe-inline'` and no `'unsafe-eval'`.
    - Styles: Google Fonts and Google sign-in.
    - Images: the app's own, `data:`, and Cloudinary.
    - Connections: the app's own, the Render API (`https` and `wss`), Cloudinary uploads, and Google sign-in.
    - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
  - **Other headers:** HSTS (1 year), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that turns off camera, microphone, geolocation and payment.
  - **`src/lib/deployConfig.test.ts`** keeps this file honest. It fails if the inline script in `index.html` changes without its hash, if the rewrite and the `connect-src` entries point at different API origins, or if script-src ever gains `'unsafe-inline'` or `'unsafe-eval'`.
- **`VITE_SOCKET_URL`** (`lib/config.ts`, `lib/socket.ts`) is where the socket connects. Empty means the same origin, which is what dev uses.
- **`safeNextPath`** refuses control characters and whitespace. Browsers strip tabs and newlines from URLs, so `/\t/evil.example` used to pass the `//` check and then turn into `//evil.example`.
- **`FilesPanel`** only renders a resource's Open and Download links when the url is http(s) (`isWebUrl`, shared with `linkify.ts`). The server already guarantees this; the check is a second layer in case bad data ever got stored.

## Dependency audit

`pnpm audit` reports one **moderate** advisory: GHSA-g3hv-75wg-m249, a ReDoS in `minimatch` < 11.0.1.

- **It's reached only through ESLint and its plugins**, which are dev tools. It isn't in the server bundle or the web bundle.
- **Upgrading isn't possible yet.** I tried forcing `minimatch@^11.0.1` through a pnpm override. ESLint then fails to load, because `eslint-plugin-import-x` imports `makeRe`, which minimatch 11 removed. I reverted the override.
- **Accepted for now.** It's dev-only, and the input is our own glob patterns, never user data. Re-check when ESLint or `eslint-plugin-import-x` move to minimatch 11.

## `/security-review` result

I ran it over the whole `phase-4` diff and these fixes: profiles and following, notifications, host controls, Settings, and this pass. **It found no vulnerabilities at confidence 8/10 or above.**

It specifically confirmed the following:

- **Host controls:** every one checks `requireHost`, and a removed member stays banned, even with the invite code.
- **Privacy:** profiles, followers' live dots and notifications never reveal a private room to anyone outside it.
- **Cursors:** they can't inject query operators or reach other users' data.
- **Change email:** it checks the password and refuses Google-linked accounts.
- **Following a notification** only ever navigates within the app.

It also listed three low-impact notes. I accepted all three:

- **A profile's "rooms hosted" count includes private rooms.** It shows only the number, never which rooms.
- **After an email change, a reset link already sent to the old address still works until it expires.** Using it requires access to that inbox.
- **A deleted account's access token stays valid until it expires (≤ 15 min).** Every handler that loads the user then answers 401.

## Accepted risks

- **Sockets outlive token expiry and log out everywhere.** A socket is authenticated once, at the handshake.
  - A tab that's already connected keeps working after its access token expires, or after "Log out everywhere", until it disconnects. After that it has to reconnect with a fresh token.
  - Deleting an account does disconnect that person's sockets.
  - Closing this gap would mean a database read on every event.
- **Rate limits and presence live in memory**, which is correct for the single server process of v1. Running several processes needs Redis-backed stores for both (see `docs/SPEC.md`).
- **Calling Render directly can spoof `X-Forwarded-For` while `TRUST_PROXY=2`.** That weakens only the per-IP limits. The per-account and per-user limits, and auth itself, are unaffected. Render can't restrict inbound traffic to Vercel's IPs on the standard plans.
- **Uploads that are never shared stay in Cloudinary until the room closes**, when the whole room folder is deleted. Each upload needs a signature, and signing is limited to 30 per person per 15 minutes. The signature fixes the folder, the file id and the allowed formats, but not the size. A file is only shared after the server checks its real size (10 MB at most) and type with Cloudinary. A file that breaks the rules is deleted, but one that is never shared isn't checked until the room closes.
- **The minimatch advisory**, as explained above.

## Before the first deploy

1. Replace the placeholder API origin `https://studibrowse-api.onrender.com` with the real Render URL in `apps/web/vercel.json`, in three places: the `/api` rewrite, and the `https:` and `wss:` entries in `connect-src`. `deployConfig.test.ts` fails if they disagree.
2. **Render** environment:
   - `NODE_ENV=production`
   - `TRUST_PROXY=2`
   - `CLIENT_ORIGIN=https://<vercel domain>`
   - a newly generated `JWT_ACCESS_SECRET`
   - the Google, Resend and Cloudinary variables
3. **Vercel** environment:
   - `VITE_SOCKET_URL=https://<render domain>`
   - `VITE_GOOGLE_CLIENT_ID`
   - root directory `apps/web`
4. After deploying:
   - Log `req.ip` once to confirm it shows your own address, not a proxy's. Adjust `TRUST_PROXY` if it doesn't.
   - Open login (including the Google button), Home, a room (chat, upload a file) and a profile with the browser console open. Check for CSP violations.
