# StudiBrowse folder structure

The target layout of the repo. Claude Code builds it in Phase 0; most folders stay empty until the phase that fills them. Keep this file up to date when the structure changes.

```text
studibrowse/
├── CLAUDE.md                     # rules Claude Code reads every session
├── README.md
├── package.json                  # root scripts: dev, build, test, lint, typecheck
├── pnpm-workspace.yaml
├── docker-compose.yml            # local MongoDB
├── .env.example                  # every env var, documented, no secrets
├── .github/workflows/ci.yml      # lint + typecheck + test + build on every push and PR
├── docs/
│   ├── SPEC.md                   # product spec (source of truth)
│   ├── ARCHITECTURE.md           # written in Phase 0, kept up to date
│   ├── SOCKET-EVENTS.md          # every event, payload and who may send it
│   ├── decisions/                # short notes on choices made (ADRs)
│   └── design/
│       ├── studibrowse-mockup.html
│       └── DESIGN-NOTES.md
├── packages/
│   └── shared/src/
│       ├── events.ts             # Socket.IO event names + typed payloads
│       ├── schemas/              # zod schemas (auth, room, chat, goal...)
│       ├── types/                # User, Room, Session, Notification...
│       └── constants.ts          # MAX_ROOM_SIZE = 20, GRACE_MS, limits
├── apps/
│   ├── server/src/
│   │   ├── index.ts              # starts HTTP + Socket.IO
│   │   ├── app.ts                # Express app (no listen, so tests can import it)
│   │   ├── config/env.ts         # reads and validates env vars at boot
│   │   ├── db/                   # Mongo connection
│   │   ├── models/               # Mongoose models
│   │   ├── modules/              # one folder per feature
│   │   │   ├── health/           #   GET /api/health
│   │   │   ├── auth/             #   routes, controller, service, tests
│   │   │   ├── users/
│   │   │   ├── rooms/
│   │   │   ├── sessions/
│   │   │   ├── resources/
│   │   │   └── notifications/
│   │   ├── realtime/
│   │   │   ├── io.ts             # Socket.IO setup + auth middleware
│   │   │   ├── handlers/         # room, presence, chat, timer, goals...
│   │   │   ├── presence.ts       # in-memory presence store
│   │   │   └── timer.ts          # pure timer logic (endsAt based)
│   │   ├── jobs/roomCleanup.ts   # closes rooms empty for 5+ minutes
│   │   ├── middleware/           # auth, error handler, rate limits
│   │   └── lib/                  # logger, errors, helpers
│   └── web/src/
│       ├── main.tsx
│       ├── app/                  # router, providers, layouts
│       ├── styles/               # tokens.css (light + dark), global.css
│       ├── components/ui/        # Button, Input, Card, Dialog, Badge, Avatar...
│       ├── components/layout/    # Sidebar, TopBar, MobileTabBar
│       ├── features/             # one folder per feature
│       │   ├── auth/  onboarding/  home/  room/  progress/
│       │   └── notifications/  profile/  settings/  welcome/
│       ├── lib/                  # api client, socket client, theme, time
│       ├── hooks/
│       └── assets/logo/          # the current book logo
└── e2e/                          # Playwright end-to-end tests (own workspace package)
```
