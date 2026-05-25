// ─────────────────────────────────────────────
// routes/events.js
// Server-Sent Events endpoint.
//
// Clients subscribe with:
//   GET /api/events?videoId=<id>
//
// The cors() middleware applied in server.js already
// sets Access-Control-Allow-Origin for chrome-extension://
// and moz-extension:// origins before this handler runs.
//
// EventSource sends a plain GET — no CORS preflight.
// ─────────────────────────────────────────────

const router       = require('express').Router();
const { addClient, removeClient } = require('../lib/sseEmitter');

// GET /api/events?videoId=xxx
router.get('/', (req, res) => {
    const videoId = (req.query.videoId || '').trim();
    if (!videoId) {
        return res.status(400).json({ success: false, error: 'videoId query parameter is required' });
    }

    // ── SSE response headers ──────────────────
    // cors() middleware has already set Access-Control-Allow-Origin.
    // We only need the SSE-specific headers here.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    // Prevent nginx / other reverse-proxies from buffering the stream
    res.setHeader('X-Accel-Buffering', 'no');

    // Flush headers immediately so the browser knows the connection is open
    res.flushHeaders();

    // Send an initial comment so the client's onopen fires right away
    res.write(': connected\n\n');

    // ── Heartbeat ─────────────────────────────
    // Keeps the TCP connection alive through proxies that close idle streams.
    // SSE comments (lines starting with ':') are ignored by EventSource.
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch (_) { /* ignore — cleanup below */ }
    }, 25_000);

    addClient(videoId, res);

    // ── Cleanup on disconnect ─────────────────
    req.on('close', () => {
        clearInterval(heartbeat);
        removeClient(videoId, res);
    });
});

module.exports = router;
