# StudiBrowse design notes

How to read `studibrowse-mockup.html`. Open it in a browser; the "All screens" picker (a mockup helper only, not part of the app) jumps between screens. Each screen also has a URL hash, e.g. `studibrowse-mockup.html#room`.

## Screens and their routes in the app

| Mockup hash | App route | Notes |
| --- | --- | --- |
| `#welcome` | `/` (signed out) | Text left, live-room preview card right (stacked on phones), very faint dot-pattern background that fades downward |
| `#signup` | `/signup` | Google button, name, username with live availability check, email, password strength meter, terms |
| `#login` | `/login` | Email or username, show/hide password, keep me logged in |
| `#forgot` | `/forgot-password` | Email field, then "Check your inbox" sent state with resend |
| (not in the mockup) | `/reset-password#token=…` | Link from the reset email. Same auth layout: new password with the strength meter; "Link expired" state with a link back to Forgot password |
| `#onboarding` | `/onboarding` | 3 steps: avatar colour + subjects, weekly goal + default timer, follow people |
| `#invite` | `/r/:inviteCode` (signed out) | Room preview, "Sign up to join" |
| `#closed` | `/r/:inviteCode` when the room is gone | Room ended, follow the host, links to live rooms |
| `#home` | `/home` | Sidebar layout, greeting, join-by-link, Create a room, hero + Happening now, Your focus this week, Rooms worth joining, recent sessions |
| `#room` | `/room/:roomId` | Distraction-free: no sidebar, timer centre, one side panel (Chat, Goals, People, Files). Leave opens the session summary dialog |
| Create dialog | modal over `/home` | Name, subject, size 2-20, public/private, timer settings, auto-start, goals. Reused as host Room settings |
| Session summary dialog | modal after leaving | Focus time, rounds, goals done, weekly progress, Back to home / Rejoin |
| `#progress` | `/progress` | This week vs goal, streak, sessions, focus by day chart, history table. Weeks run Sunday to Saturday like Home's chart, so the app reads "Sun 1 Nov to Sat 7 Nov" and "by Saturday" where the mockup's text says Mon to Sun. The "Weekly goal" button links to Settings |
| `#notifications` | `/notifications` | All / Unread / Rooms opened, grouped Today and Earlier, Join on room alerts |
| `#profile` | `/u/:username` | Cover, avatar, Follow/Share, Hosting now + Join, stats, recent rooms, about, followers |
| `#settings` | `/settings` | Account, Appearance (System/Light/Dark), notifications, timer defaults + weekly goal, privacy, log out / delete. Deliberate differences from the mockup: no Upload photo (no profile photos in v1); no "New followers" toggle (no such notification in the spec); no "Let anyone follow me" (no follow approval in the spec); "Round ends" reads "A notification when a focus round ends" (the sound has its own mute in the room); the first privacy toggle is "Show what I'm studying / The line under your name on your profile", which is what it controls; an added "Log out of all devices" row; and Delete account asks you to type your username instead of confirming by email. Changing the email asks for your password in a dialog |

## Layout rules

- The phone layout (tab bar and slim header) starts below 768px, not the mockup's 680px, so 681-767px shows the phone layout instead of the 80px icon rail. The mockup's other phone rules apply from 767px down.
- Copy that differs on purpose: the invite errors say "invite link or code" without "a 6-character code", because invite codes are 10 characters; Home's subtitle doesn't say how many people are studying (there's no live count in v1); the room bar says "N sessions · Xh focused" (the room's total, not "today"); the danger section says deleting "removes your profile, follows and notifications", which is what it removes.
- Chat system lines are worked out on each device (see ARCHITECTURE.md › Focus room), so there's no "Room opened by …" line.
- Room cards show "N studying now" instead of the mockup's avatar stack: the room list doesn't carry who is inside.

- Signed-in pages: left sidebar with Home, Your progress, Notifications, Settings, People you follow (name + green live dot only), streak card, profile. No Create button in the sidebar. On phones the sidebar becomes a bottom tab bar: Home, Create, Progress, Settings.
- One main action per screen; at most 3 room cards per row.
- Room cards: subject tile, green pulsing Live badge, people count (e.g. 14/20).

## Tokens

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| Background | #0b1210 | #f4f6f5 | Page |
| Surfaces | #121b18, #16211d | #ffffff, #f6f8f7 | Cards, panels, sidebar |
| Lines | #1f2c27 | #e1e7e4 | Borders, dividers |
| Text | #ecf2ef | #121a17 | Main text |
| Muted text | #8fa19a | #5f6d68 | Secondary text |
| Accent | #4cbf98 | #1d6b57 | Primary buttons, timer ring, active states |
| Live / good | #55c993 | #1a7f52 | Live badges, pulsing dots |
| Brass | #e0a95a | #a86c1c | Streaks, host badge |
| Break | #7cb7ff | #2f6fd0 | Break phase |

Additions to the mockup's tokens (`tokens.css`):

- `--violet-ink`, `--good-ink`, `--amber-ink`: text in the status colours. In light mode the mockup's violet, green and amber text is 3.7 to 4.3:1 on its own tints (below WCAG AA), so these are the same hues a little darker (#2b65bd, #19794e, #925e18). In dark mode they equal the base colours.
- `--faint` stays for icons, disabled controls and separators only. Text the mockup sets in `--faint` (chat times, field hints, placeholders, chart labels, group headings, the auth "or", the welcome footer) uses `--muted`, which passes AA in both themes.
- Fixed rgba values the mockup hardcodes are tokens too (`--accent-line`, `--hosting-line`, `--hosting-wash`, `--danger-line*`, `--danger-hover`, `--btn-light-hover`), with the mockup's values.

Fonts: Bricolage Grotesque (display, headings, big numbers), Hanken Grotesk (body), JetBrains Mono (timer, durations, counts). The mockup's `:root` and `[data-theme="light"]` CSS blocks hold the full set of variables (radii, shadows, spacing); copy them into `apps/web/src/styles/tokens.css`.

## Theme

Follows the device by default. The sun/moon button (top bars) and Settings › Appearance (System / Light / Dark) override it. The choice is saved in localStorage as `sb-theme` and applied as `data-theme` on `<html>` before first paint so there is no flash.

## Logo

Keep the current open-book logo: the `i-logo` symbol in the mockup, also saved as `logo/studibrowse-book-icon.svg` (24x24, stroke uses `currentColor`). In the sidebar it sits in a rounded accent tile next to the "StudiBrowse" wordmark set in Bricolage Grotesque. Do not redesign it.

## Icons

The mockup's icon set lives in its inline `<svg>` sprite (`i-bell`, `i-plus`, `i-play`, `i-pause`, `i-skip`, `i-reset`, `i-crown`, `i-flame`, `i-sun`, `i-moon`, ...). Recreate them as small React icon components with the same paths.
