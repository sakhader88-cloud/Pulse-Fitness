# Pulse — Habit & Fitness Tracker (PWA)

A full-stack, installable habit and fitness tracker: a Node/Express
backend with real multi-user accounts (bcrypt-hashed passwords, session
auth), and a static HTML/CSS/JS frontend — no framework, no build step,
and no external font/CDN dependency, so it works fully offline once
installed.

## What's actually in this build

- **Real accounts** — sign up / log in, sessions via secure httpOnly
  cookies, passwords hashed with bcrypt. Not a demo/single-user toy.
- **Habits** — create with an emoji + color, check off daily, see
  live streaks per habit.
- **Workouts** — log type, duration, calories (auto-estimated if you
  don't provide one), and notes.
- **Stats** — a 7-day completion bar chart, best streak, total
  minutes trained, and per-habit streak breakdown.
- **Installable PWA** — a proper `manifest.json` (with both `any` and
  `maskable` icons, which Android specifically requires for a good
  home-screen icon), and a service worker that caches the app shell
  for offline use while always hitting the network fresh for API data.

## Running it locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Open **http://localhost:4400**. Sign up with any email/password (stored
locally in `db.json`, created automatically on first run).

`npm run dev` restarts on file changes.

## Project structure

```
pulse-app/
├── server.js              Express app: auth, habits, workouts, stats API
├── db.js                   Tiny JSON-file storage layer (load/save)
├── db.json                 Created automatically on first run — your local data
├── package.json
└── public/
    ├── index.html
    ├── manifest.json        PWA manifest — name, icons, theme color, display mode
    ├── service-worker.js    Offline caching for the app shell
    ├── css/style.css        The design system
    ├── js/app.js             All frontend logic — no framework
    └── icons/                App icons (192/512, regular + maskable)
```

## API endpoints

| Method | Route                        | Description |
|--------|------------------------------|-------------|
| POST   | `/api/auth/register`          | `{ email, password, name }` |
| POST   | `/api/auth/login`              | `{ email, password }` |
| POST   | `/api/auth/logout`             | Ends the session |
| GET    | `/api/auth/me`                 | Current user, or `{ user: null }` |
| GET    | `/api/habits`                   | Your habits + today's completion status |
| POST   | `/api/habits`                   | `{ name, emoji, color, frequency }` |
| DELETE | `/api/habits/:id`               | Deletes a habit and its check-ins |
| POST   | `/api/habits/:id/checkin`       | Toggles today's completion |
| GET    | `/api/workouts`                 | Your logged workouts |
| POST   | `/api/workouts`                 | `{ type, durationMin, calories, notes, date }` |
| DELETE | `/api/workouts/:id`             | Deletes a workout |
| GET    | `/api/stats`                    | Streaks, 7-day chart data, totals |

All habit/workout/stats routes require an active session (401 if not
logged in).

## Testing installability yourself

1. Run the app and open it in Chrome on Android (or Chrome desktop with
   device emulation).
2. You should see an "Install" prompt, or find it under the browser's
   menu → "Install app" / "Add to Home Screen".
3. Turn off Wi-Fi/data after installing and reopen it — the app shell
   still loads (though API calls like login will correctly show an
   offline message, since your habit data lives on a server).

---

## Getting this onto the Play Store — the real steps

I can't generate a signed Android package or publish anything for
you from here — that requires a Google Play Developer account (a
one-time $25 fee and identity verification, done directly with Google)
and a signing key that only you should hold. But the actual technical
path for a PWA like this one is well-established and doesn't require
rewriting anything:

### 1. Deploy the app somewhere with HTTPS
Play Store submission requires your PWA to be live on a real HTTPS
domain (installing from `localhost` doesn't count). Render, Railway,
Fly.io, or a VPS all work — see "Deploying it" below.

### 2. Wrap it as a Trusted Web Activity (TWA)
A TWA is Google's own supported way to ship a PWA as an Android app —
it's a thin native wrapper that opens your deployed site full-screen,
with no browser UI. Two tools do this for you:

- **[PWABuilder](https://www.pwabuilder.com/)** (easiest — web-based,
  made by Microsoft in partnership with Google): paste your deployed
  URL, it audits your manifest/service worker, then generates a signed
  or unsigned Android package for you to download.
- **[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)**
  (Google's own CLI): `npm install -g @bubblewrap/cli`, then
  `bubblewrap init --manifest=https://yourdomain.com/manifest.json`
  walks you through generating the Android project and building the
  `.aab` file Play Store requires.

### 3. Verify domain ownership (Digital Asset Links)
Android needs proof you own the domain the TWA points to, via a
`assetlinks.json` file hosted at
`https://yourdomain.com/.well-known/assetlinks.json`. Both PWABuilder
and Bubblewrap generate this file for you — you just need to upload it
to that exact path on your server.

### 4. Submit to Play Console
Create a listing at [play.google.com/console](https://play.google.com/console)
(the $25 one-time fee applies here), upload the `.aab` file from step 2,
fill in the store listing (screenshots, description, privacy policy —
required even for a simple app), and submit for review.

This app's manifest and service worker are already built correctly for
this path — no changes needed before you deploy it.

## Deploying it

Standard Node/Express app. Set the start command to `npm start`;
`server.js` already reads `process.env.PORT`. One thing to change for
production: set a real `SESSION_SECRET` environment variable (a long
random string) — right now it falls back to a dev default that must
not be used once real user accounts exist on a public deployment.

```bash
SESSION_SECRET="a-long-random-string-here" npm start
```
