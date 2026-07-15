# YouTube Citation Extension

A Chrome/Firefox extension for adding and managing citations on long-form YouTube videos.

## Architecture

```
Chrome/Firefox Extension (content scripts + background.js)
        ↓  chrome.runtime.sendMessage → fetch()
Express REST API  (backend/server.js)
        ↓  Mongoose
MongoDB  (local via Compass for dev, Atlas for production)
```

The extension no longer depends on Firebase. All data is stored in MongoDB through a self-hosted Express backend.

## Setup

### Prerequisites
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) — runs the local database
- [MongoDB Compass](https://www.mongodb.com/try/download/compass) — GUI to inspect and manage your data (optional but recommended for dev)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in your values
npm run dev
```

`.env` variables:

| Variable | Description |
|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/citepoint` for local, Atlas URI for production |
| `PORT` | Port the server runs on (default `3000`) |
| `ALLOWED_ORIGIN` | Your extension's `chrome-extension://<id>` origin (single value) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins (overrides `ALLOWED_ORIGIN`) |
| `NODE_ENV` | Set to `production` for Apache-style HTTP logs; omit for dev-style logs |

The server exposes a `/health` endpoint — visit `http://localhost:3000/health` to confirm it's running.

> **Rate limiting:** All endpoints are rate-limited (200 req / 15 min general; 60 req / 15 min on write endpoints). You will receive a `429` response if the limit is exceeded.

### Screenshot

#### Finding Your Extension ID for ALLOWED_ORIGIN
<img width="955" height="374" alt="Screenshot 2026-05-13 153603" src="https://github.com/user-attachments/assets/fac2877d-d4a5-428c-be25-23a32cc6af8f" />

### 2. Extension

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load unpacked** and select the repository root folder
5. Open a YouTube video

> Make sure the backend is running before using the extension.

**Firefox:** Load via `about:debugging > This Firefox > Load Temporary Add-on`, selecting `manifest.json`.

### 3. Changing the API URL

The backend URL (`http://localhost:3000`) is read at runtime from `manifest.json`'s `host_permissions[0]`. To point at a production server, update that value — no code changes needed:

```json
"host_permissions": ["https://your-production-api.com/*"]
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/citations/:videoId` | Load citations for a video (paginated) |
| POST | `/api/citations/:videoId` | Add a citation |
| DELETE | `/api/citations/:videoId/:id` | Delete a citation (owner only) |
| PATCH | `/api/citations/:videoId/:id/vote` | Vote on a citation |
| GET | `/api/requests/:videoId` | Load citation requests (paginated) |
| GET | `/api/requests/:videoId/by-ids` | Fetch specific requests by ID |
| POST | `/api/requests/:videoId` | Add a citation request |
| DELETE | `/api/requests/:videoId/:id` | Delete a request (owner only) |
| PATCH | `/api/requests/:videoId/:id/vote` | Vote on a request |
| POST | `/api/reports` | Submit a report |
| GET | `/api/events?videoId=:id` | Server-Sent Events stream for real-time updates |
| GET | `/health` | Health check — returns `{ status: "ok", sseClients: N }` |

## Running Tests

```bash
cd backend
npm test          # backend unit + integration tests (requires local MongoDB)
```

E2E tests (Chrome / Firefox) are in the root `package.json`:

```bash
npm run test:e2e            # Playwright / Chrome
npm run test:e2e:firefox    # Selenium / Firefox
```

## Migrating from Firebase

If you have existing data in Firestore, use the migration script:

```bash
# 1. Install Firebase Admin SDK
cd backend && npm install firebase-admin --save-dev

# 2. Set credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
export FIRESTORE_PROJECT_ID=your-project-id

# 3. Run (idempotent — safe to re-run)
node backend/scripts/migrate-from-firestore.js
```

See [`backend/scripts/migrate-from-firestore.js`](backend/scripts/migrate-from-firestore.js) for field-mapping details.

## Disclaimer

This extension was developed as part of a thesis submission. It may have incomplete features and is subject to further improvements.
