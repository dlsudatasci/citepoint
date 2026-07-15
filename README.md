# CitePoint

CitePoint is a Manifest V3 browser extension (Chrome + Firefox) that lets YouTube viewers attach timestamped citations, citation requests, and threaded discussion to claims made in a video — turning a one-way video into something a community can fact-check and cross-reference in place, without leaving the page.

It ships with a self-hosted Express + MongoDB API, a React dashboard for browsing/moderating activity, and an in-page discussion thread with voting and an expert-verification workflow.

> **Status:** actively developed, not yet production-hardened. See [`COMPLETE_CODEBASE_AUDIT.md`](COMPLETE_CODEBASE_AUDIT.md) for the current, dated audit and known issues before deploying this beyond a local/trusted environment — in particular, the app has **no real authentication system** (see [Identity model](#identity-model) below).

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Identity model](#identity-model)
- [Folder structure](#folder-structure)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Building the dashboard](#building-the-dashboard)
- [Browser extension setup](#browser-extension-setup)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Testing](#testing)
- [Development workflow](#development-workflow)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

| Feature | Description |
|---|---|
| **Timestamped citations** | Mark a moment in a YouTube video and attach a sourced claim, quote, or correction to it. |
| **Citation requests** | Flag a claim that needs a source, so someone else can fulfill it. |
| **Recording UI** | Drag handles on the YouTube seek bar to mark a start/end range without leaving the video. |
| **Voting** | Upvote/downvote citations, requests, and discussion replies. Server-enforced vote state machine — no double-counting or replay abuse. |
| **Categories & topics** | Citations/requests are tagged by claim type (category) and subject matter (topic) for filtering. |
| **Expert verification** | Users can apply for expert status in a topic; admins review applications; verified experts can badge a category as expert-confirmed. |
| **Threaded discussion** | Nested replies (depth-capped) on any citation or request, with their own voting. |
| **Notifications** | Users following a topic get notified when new citations/requests land in it. |
| **Real-time updates** | Server-Sent Events push new citations/votes to every open tab watching a video; a polling fallback exists for when SSE drops. |
| **Dashboard** | React app (general feed, expert feed, analytics, profile, notifications, expert application + admin review). |
| **Reporting** | Flag a citation/request/reply for moderator review. |
| **Firefox support** | Same codebase, loaded via `about:debugging`; see `browser_specific_settings` in `manifest.json`. |

## Tech stack

- **Extension:** vanilla JS, Manifest V3, [`webextension-polyfill`](lib/browser-polyfill.js) for Chrome/Firefox parity, classic (non-module) content scripts loaded in a fixed order.
- **Dashboard:** React 19 + Vite, built to a single bundle consumed by the extension.
- **Backend:** Node.js, Express 4, Mongoose 8, `express-rate-limit`, `cors`, `morgan`, `dotenv`.
- **Database:** MongoDB (local for dev, Atlas for production).
- **Testing:** Jest + Supertest (backend), Playwright (Chrome e2e), Selenium/geckodriver (Firefox e2e).
- **CI:** GitHub Actions ([`.github/workflows/playwright.yml`](.github/workflows/playwright.yml)) — spins up MongoDB, runs both e2e suites against a real, unpacked build of the extension.

## Architecture

```
┌────────────────────────────┐         ┌───────────────────────────┐        ┌─────────────┐
│ Browser Extension            │  fetch  │ Express REST API           │Mongoose│  MongoDB    │
│  content/*.js (YouTube panel)│────────▶│ backend/routes/*.js         ├───────▶│  citepoint  │
│  background.js (service      │◀────────┤ backend/app.js (CORS,       │        │  database   │
│  worker: caching, routing)   │  JSON   │ rate limiting, middleware) │        └─────────────┘
│  dashboard/ discussion/      │         │ backend/server.js (bootstrap)│
│  (extension pages, React)    │  SSE    │ /api/events                │
└────────────────────────────┘◀────────┤ backend/lib/sseEmitter.js  │
                                          └───────────────────────────┘
```

A content script or extension page calls `content/api.js` (or, from the service worker, `background/background.js`'s own fetch wrappers). Both derive the API's base URL at runtime from `manifest.json → host_permissions[0]` — **not** from `config/config.js`, which is legacy and unused by the running extension. Express applies CORS + rate limiting, routes into `backend/routes/*.js`, which validate input and talk to MongoDB through Mongoose models. New citations and vote changes are pushed to every open tab watching that video via Server-Sent Events (`GET /api/events`), which `content/citations.js` subscribes to and uses to live-patch the DOM; a slower interval poll exists as a fallback.

### Identity model

There is **no authentication system**. "Identity" is a free-text `username` string the extension detects from the visitor's own YouTube account (`content/username.js`) and sends with every request. Server-side "ownership" and "authorization" checks are string comparisons against this client-supplied field. This is a deliberate simplification for the current stage of the project, not an oversight — but it means:

- Anyone who knows (or guesses) a username can act as that user against the API directly (not just through the extension UI).
- Expert/admin status checks (`isExpert`, `isAdmin`) trust the same spoofable field.
- CORS currently allows *any* `chrome-extension://`/`moz-extension://` origin, not just this extension's ID — restrict `ALLOWED_ORIGINS` if you deploy this beyond local dev.

Treat this as the single most important constraint when evaluating this project for anything beyond a trusted, small-group deployment. A real identity/session layer is the top item on the [Roadmap](#roadmap).

## Folder structure

| Path | Purpose |
|---|---|
| `manifest.json` | MV3 manifest — permissions, content script injection order, web-accessible resources |
| `content/` | Content scripts injected into `youtube.com`: panel UI, citations, voting, forms, recording, reporting, username detection, player hooks |
| `background/background.js` | MV3 service worker — message router, response caching, vote-delta computation |
| `popup/` | Toolbar popup |
| `dashboard/` | Extension page that mounts the built React dashboard (`dashboard/dist/`) |
| `src/dashboard/` | React dashboard source (Vite) |
| `discussion/` | Extension page for nested threaded discussion + voting |
| `forms/` | Standalone HTML forms for adding a citation/request |
| `config/config.js` | Shared category/topic list (its `API_BASE_URL` constant is legacy/unused — see Architecture) |
| `utils/utils.js` | Shared DOM helpers: `showToast`, `showConfirm`, `escapeHtml` |
| `lib/browser-polyfill.js` | Mozilla's `webextension-polyfill` |
| `styles/` | `tokens.css` (design tokens), `components.css` (shared `cp-*` component classes), `extension.css` (panel-specific styles) |
| `backend/routes/` | `citations.js`, `requests.js`, `reports.js`, `discussion.js`, `dashboard.js`, `experts.js`, `notifications.js`, `profile.js`, `events.js`, `feeds.js`, `videos.js` |
| `backend/models/` | Mongoose schemas: `Citation`, `Request`, `Report`, `Vote`, `Expert`, `ExpertApplication`, `Notification`, `UserProfile`, `Video` |
| `backend/lib/` | `sseEmitter.js`, `notifyExperts.js`, `voting.js` (server-side vote state machine) |
| `backend/config/` | `categories.js`, `constants.js`, `experts.js`, `admins.js` |
| `backend/scripts/migrate-from-firestore.js` | One-time legacy Firebase → MongoDB migration script |
| `backend/tests/` | Jest + Supertest integration tests |
| `e2e/`, `selenium/` | Playwright (Chrome) and Selenium (Firefox) end-to-end tests, driving the real extension against live `youtube.com` |
| `.github/workflows/playwright.yml` | CI: MongoDB service container, backend install, Playwright + Selenium suites |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) — the local database
- [MongoDB Compass](https://www.mongodb.com/try/download/compass) — optional GUI for inspecting data
- Chrome or Firefox (121+)

### 1. Clone and install

```bash
git clone <this-repo>
cd citepoint
npm install            # root deps (dashboard build, e2e tooling)
cd backend && npm install
```

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in what you need:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | `mongodb://localhost:27017/citepoint` for local, or an Atlas connection string in production |
| `PORT` | No (default `3000`) | Port the API listens on |
| `ALLOWED_ORIGIN` | No | A single allowed CORS origin, e.g. `chrome-extension://<your-extension-id>` |
| `ALLOWED_ORIGINS` | No | Comma-separated list of allowed origins; overrides `ALLOWED_ORIGIN` |
| `NODE_ENV` | No | `production` for Apache-style access logs and real rate limits; omit for dev-style logs |
| `EXPERT_CONFIG` | No | Grants expert status without going through the application flow. Format is **`username:topic1,topic2\|username2:topic3`** (pipe-separated entries, colon before the topic list, comma-separated topics) — e.g. `EXPERT_CONFIG=alice:History,Science\|bob:Economics` |
| `ADMIN_USERNAMES` | Yes, to review applications | Comma-separated usernames allowed to list and approve/reject pending expert applications. Without this set, **nobody** can review applications. |

> The API allows any `chrome-extension://`/`moz-extension://` origin by default, regardless of `ALLOWED_ORIGIN(S)` — those variables add *additional* allowed web origins, they don't restrict extension origins. See [Identity model](#identity-model).

**Rate limiting:** all endpoints are rate-limited — 400 requests/15 min general, 120 requests/15 min on the mutation-heavy routers (citations, requests, reports, experts, profile, discussion, videos). You'll get a `429` if you exceed it. Limits are effectively disabled when `NODE_ENV=test`.

## Running locally

```bash
cd backend
npm run dev             # nodemon, auto-restarts on change
# or: npm start
```

Visit `http://localhost:3000/health` to confirm it's running (`{ status: "ok", sseClients: N }`).

## Building the dashboard

The React dashboard is a separate build step, run from the **repo root**:

```bash
npm run build            # one-off build → dashboard/dist/dashboard.bundle.{js,css}
npm run watch             # rebuild on change, for active dashboard development
```

`dashboard/dashboard.html` loads the built bundle — the dashboard will not reflect source changes in `src/dashboard/` until you rebuild.

## Browser extension setup

**Chrome:**
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → select the repository root
4. Open a YouTube video — make sure the backend (and, if you're viewing the dashboard, a built bundle) is running

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on** → select `manifest.json`

### Pointing the extension at a different API

The API base URL is read at runtime from `manifest.json → host_permissions[0]`. To point at a different backend, edit that entry — no code changes needed:

```json
"host_permissions": ["https://your-api-host.example.com/*"]
```

> The current `host_permissions[0]` in this repo points at a specific deployment (`http://altdsidccf.dlsu.edu.ph:15020`) served over plain HTTP. If you deploy your own backend, use HTTPS — see [`COMPLETE_CODEBASE_AUDIT.md`](COMPLETE_CODEBASE_AUDIT.md) for why this matters given the identity model above.

## API reference

Base path: `/api`. All bodies are JSON. `videoId` is a YouTube video ID; `username` is the free-text identity described in [Identity model](#identity-model).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/citations/:videoId` | List citations for a video (paginated, filterable by category) |
| `GET` | `/citations/:videoId/:id` | Fetch one citation |
| `POST` | `/citations/:videoId` | Add a citation |
| `DELETE` | `/citations/:videoId/:id` | Delete a citation (owner only) |
| `PATCH` | `/citations/:videoId/:id/vote` | Vote on a citation |
| `PATCH` | `/citations/:videoId/:id/category` | Verify/set a citation's category (expert only) |
| `GET` | `/requests/:videoId` | List citation requests |
| `GET` | `/requests/:videoId/by-ids` | Fetch specific requests by ID (batch, capped at 50) |
| `POST` | `/requests/:videoId` | Add a citation request |
| `DELETE` | `/requests/:videoId/:id` | Delete a request (owner only) |
| `PATCH` | `/requests/:videoId/:id/vote` | Vote on a request |
| `POST` | `/reports` | Submit a report on a citation/request/reply |
| `GET` | `/discussion/citation/:id` \| `/discussion/request/:id` | Fetch a discussion thread (flat or `?tree=true`) |
| `POST` | `/discussion/reply` | Post a reply |
| `GET` | `/events?videoId=:id` | Server-Sent Events stream for real-time updates |
| `GET` | `/experts/:username` | Public expert status lookup |
| `POST` | `/experts/apply` | Submit an expert application |
| `GET` | `/experts/applications/pending` | List pending applications (admin only) |
| `PATCH` | `/experts/applications/:id/review` | Approve/reject an application (admin only) |
| `GET` | `/notifications/:username` | List a user's notifications |
| `PATCH` | `/notifications/:id/read` | Mark one notification read (owner only) |
| `PATCH` | `/notifications/:username/read-all` | Mark all notifications read (owner only) |
| `GET` | `/profile/:username` | Public profile |
| `PUT` | `/profile/:username` | Edit own profile (owner only) |
| `GET` | `/profile/:username/history` | Activity history |
| `GET` | `/dashboard/trending` | Aggregate stats (optionally scoped to a `videoId`) |
| `POST` | `/videos/upsert` | Upsert video metadata (title, thumbnail, channel) |
| `GET` | `/feeds/general` | Paginated general feed, filterable by topic |
| `GET` | `/feeds/expert` | Feed scoped to an expert's topics |
| `GET` | `/health` | Health check |

## Database schema

MongoDB collections, via Mongoose (`backend/models/`):

- **Citation** / **Request** — the core content: `videoId`, `timestampStart`/`timestampEnd`, title/description, `source`, `username`, `category`, `topics`, `voteScore`, `dateAdded`. Indexed on `videoId+dateAdded` and `videoId+voteScore+dateAdded` for feed queries.
- **Vote** — one document per `(itemId, itemType, username)`, unique-indexed, backing the server-side vote state machine (`backend/lib/voting.js`) that prevents replay/inflation.
- **Report** — flags against an item; unique-indexed on `(itemId, reporterUsername)` to prevent duplicate reports.
- **Expert** / **ExpertApplication** — expert registry and the pending-review queue for applications.
- **Notification** — per-user fan-out when new content lands in a followed topic.
- **UserProfile** — display name, bio, followed topics, activity history.
- **Video** — cached metadata (title, thumbnail, channel) for videos that have citations.

## Testing

```bash
cd backend && npm test          # Jest + Supertest, requires a local MongoDB
```

From the repo root:

```bash
npm run test:e2e            # Playwright, Chrome — drives the real unpacked extension against live youtube.com
npm run test:e2e:firefox    # Selenium/geckodriver, Firefox
npm run test:e2e:all        # both, sequentially
```

E2E tests navigate to a real YouTube video and interact with the actual injected extension UI — they're slower and more flake-prone than unit tests by nature (see [Troubleshooting](#troubleshooting)).

## Development workflow

1. Branch off `dev` for new work; PRs merge back into `dev`.
2. Backend changes: add/extend tests in `backend/tests/` alongside the route/model you touch.
3. Extension changes: if you touch `content_scripts` order, permissions, or `web_accessible_resources` in `manifest.json`, re-check both Chrome and Firefox loading.
4. Dashboard changes: `npm run watch` from the root while iterating, then a final `npm run build` before committing the bundle output (gitignored — not committed; rebuilt by whoever pulls your branch).
5. Run the relevant e2e slice locally before opening a PR if you touched a user-facing flow (see [Testing](#testing)).

There is currently no linter or formatter configured in this repo — match the surrounding file's style by hand.

## Deployment

See [`DEPLOYMENT_MANUAL.md`](DEPLOYMENT_MANUAL.md) for the full deployment walkthrough (backend hosting, MongoDB Atlas setup, updating `host_permissions`, packaging the extension for distribution).

## Troubleshooting

**"Failed to fetch" in the panel / dashboard.** The backend isn't running, or `manifest.json → host_permissions[0]` doesn't match where it's actually listening. Check `http://localhost:3000/health`.

**429 "Too many requests."** You've hit the rate limiter (see [Environment variables](#environment-variables)). This is expected under heavy local e2e test runs against a normal (non-test) backend — either run tests with `NODE_ENV=test`, or wait out the 15-minute window.

**Dashboard shows stale content after a code change.** You edited `src/dashboard/` but didn't rebuild — run `npm run build` (or `npm run watch`) from the root.

**E2E tests fail intermittently around ads or consent banners.** The e2e suite drives real `youtube.com` pages, so it inherits YouTube's own flakiness (ad rollouts, region-specific consent dialogs, DOM changes). A failure isn't necessarily a regression — check whether it reproduces on a clean checkout before assuming your change caused it.

**Mongoose logs a duplicate-index warning on boot.** If you see this after adding a new field with `unique: true`, don't also add a separate `schema.index(...)` call for the same field — `unique: true` already creates one.

## FAQ

**Does this require a Google/YouTube API key?** No. The extension reads the visitor's own YouTube page DOM; it doesn't call the YouTube Data API.

**Can I run this without MongoDB Atlas?** Yes — `MONGODB_URI=mongodb://localhost:27017/citepoint` is enough for local development. Atlas is only needed for a real deployment.

**Why is there both `dashboard/dashboard.css` and a built `dashboard.bundle.css`?** `dashboard.css` holds page-chrome styles that predate (and still support) the current dashboard shell; the bundle holds the React component styles. Both load together.

**Is voting abuse-resistant?** Vote state is tracked server-side per `(item, username)` via a dedicated `Vote` collection and a state-machine (`backend/lib/voting.js`), so repeated identical votes and client-side double-submits can't inflate a score. It's still bound by the identity model above — a spoofed username can vote as if it were someone else.

## Contributing

1. Open an issue describing the change before starting non-trivial work.
2. Keep PRs scoped to one concern; note in the PR description which e2e slice (if any) you ran locally.
3. Add or update tests for anything touching `backend/routes/` or `backend/models/`.
4. Don't commit `dashboard/dist/` — it's a build artifact, rebuilt on install.

## Roadmap

See [`COMPLETE_CODEBASE_AUDIT.md`](COMPLETE_CODEBASE_AUDIT.md) for the current prioritized list. Highest-level items:

- A real identity/session layer, replacing the free-text `username` field
- HTTPS for the production API
- Extending the design-token/component system's remaining gaps (dialog/toast accessibility, contrast fixes)
- Broader Firefox e2e coverage (currently smoke-test only)
- Pagination in the React dashboard's feeds

## License

Not yet specified — check with the repository owner before reuse or redistribution.
