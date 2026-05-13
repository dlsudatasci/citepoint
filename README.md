# YouTube Citation Extension

A Chrome extension for adding and managing citations on YouTube videos.

## Architecture

```
Chrome Extension (content scripts + background.js)
        ↓  fetch()
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
| `ALLOWED_ORIGIN` | Your extension's `chrome-extension://<id>` origin |

The server exposes a `/health` endpoint — visit `http://localhost:3000/health` to confirm it's running.

### Screenshot

#### Finding Your Extension ID FOR ALLOWED_ORIGIN
<img width="955" height="374" alt="Screenshot 2026-05-13 153603" src="https://github.com/user-attachments/assets/fac2877d-d4a5-428c-be25-23a32cc6af8f" />

### 2. Extension

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load unpacked** and select the repository root folder
5. Open a YouTube video

> Make sure the backend is running before using the extension.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/citations/:videoId` | Load citations for a video |
| POST | `/api/citations/:videoId` | Add a citation |
| DELETE | `/api/citations/:videoId/:id` | Delete a citation |
| PATCH | `/api/citations/:videoId/:id/vote` | Vote on a citation |
| GET | `/api/requests/:videoId` | Load citation requests |
| POST | `/api/requests/:videoId` | Add a citation request |
| PATCH | `/api/requests/:videoId/:id/vote` | Vote on a request |
| POST | `/api/reports` | Submit a report |

## Disclaimer

This extension was developed as part of a thesis submission. It may have incomplete features and is subject to further improvements.
