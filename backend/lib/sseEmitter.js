// ─────────────────────────────────────────────
// lib/sseEmitter.js
// In-process SSE client registry and event broadcaster.
//
// Each connected EventSource is stored by videoId.
// Routes call emit() after mutations; the emitter
// pushes the serialized event to every open response.
//
// NOTE: Single-process only.  If you ever run the
// backend in cluster mode, replace this with a
// Redis pub/sub broadcaster.
// ─────────────────────────────────────────────

/** @type {Map<string, Set<import('express').Response>>} videoId → active response objects */
const _clients = new Map();

/**
 * Register a new SSE client.
 * @param {string} videoId
 * @param {import('express').Response} res
 */
function addClient(videoId, res) {
    if (!_clients.has(videoId)) _clients.set(videoId, new Set());
    _clients.get(videoId).add(res);
}

/**
 * Remove a client (call from req.on('close')).
 * @param {string} videoId
 * @param {import('express').Response} res
 */
function removeClient(videoId, res) {
    const set = _clients.get(videoId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) _clients.delete(videoId);
}

/**
 * Broadcast a JSON event to all clients watching a videoId.
 * Silently skips clients that have already disconnected.
 * @param {string} videoId
 * @param {Object} event  Plain object; will be JSON-serialised.
 */
function emit(videoId, event) {
    const set = _clients.get(videoId);
    if (!set || set.size === 0) return;

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
        try {
            res.write(payload);
        } catch (_) {
            // Client disconnected mid-write — the 'close' event on the
            // request will call removeClient() shortly after.
        }
    }
}

/**
 * Total number of active SSE connections across all videos.
 * Useful for health/monitoring endpoints.
 * @returns {number}
 */
function clientCount() {
    let n = 0;
    for (const set of _clients.values()) n += set.size;
    return n;
}

module.exports = { addClient, removeClient, emit, clientCount };
