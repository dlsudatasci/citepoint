// ─────────────────────────────────────────────
// api.js
// All communication with background.js lives here.
// Every function returns a Promise that resolves
// with the response data or rejects with an Error.
// ─────────────────────────────────────────────

// Derive the API base from manifest.json host_permissions[0] so the URL is
// defined in exactly one place.  Update manifest.json for production deployments.
const _CP_API_BASE = (() => {
    try {
        const perm = chrome.runtime.getManifest().host_permissions?.[0] ?? '';
        return perm.replace(/\/\*$/, ''); // strip trailing /*
    } catch (_) {
        return 'http://localhost:3000';   // safe fallback
    }
})();

/**
 * Internal wrapper — send a message to background.js and return the response.
 * Rejects if response.success is false.
 */
async function _send(payload) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(payload, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!response) {
                    return reject(new Error('No response from background script'));
                }
                if (!response.success) {
                    return reject(new Error(response.error || 'Unknown error from background'));
                }
                resolve(response);
            });
        } catch (err) {
            reject(err);
        }
    });
}

// ── Citations ────────────────────────────────

async function apiGetCitations(videoId, page = 1, limit = 20) {
    const res = await _send({ type: 'getCitations', videoId, page, limit });
    return { citations: res.citations || [], pagination: res.pagination || null };
}

async function apiAddCitation(citationData) {
    return _send({ type: 'addCitation', data: citationData });
}

/**
 * @param {string} citationId
 * @param {string} videoId
 * @param {string} username  — must match the citation's owner for the delete to succeed
 */
async function apiDeleteCitation(citationId, videoId, username) {
    return _send({ type: 'deleteCitation', citationId, videoId, username });
}

// ── Citation Requests ────────────────────────

async function apiGetRequests(videoId, page = 1, limit = 20) {
    const res = await _send({ type: 'getCitationRequests', videoId, page, limit });
    return { requests: res.requests || [], pagination: res.pagination || null };
}

/**
 * Fetch a specific subset of requests by ID.
 * Used to populate request-response groups on the Citations tab without
 * pulling the full requests list (replaces the old blanket 200-item fetch).
 *
 * @param {string}   videoId
 * @param {string[]} ids  — array of request IDs to fetch; duplicates are handled server-side
 * @returns {{ requests: Array }}
 */
async function apiGetRequestsByIds(videoId, ids) {
    if (!ids || ids.length === 0) return { requests: [] };
    const res = await _send({ type: 'getRequestsByIds', videoId, ids });
    return { requests: res.requests || [] };
}

async function apiAddRequest(requestData) {
    return _send({ type: 'addRequest', data: requestData });
}

/**
 * @param {string} requestId
 * @param {string} videoId
 * @param {string} username  — must match the request's owner for the delete to succeed
 */
async function apiDeleteRequest(requestId, videoId, username) {
    return _send({ type: 'deleteRequest', requestId, videoId, username });
}

// ── Votes ────────────────────────────────────

/**
 * @param {string} itemId
 * @param {'up'|'down'} voteType
 * @param {'citation'|'request'} itemType
 * @param {string} videoId
 */
async function apiUpdateVote(itemId, voteType, itemType, videoId) {
    return _send({ type: 'updateVotes', itemId, voteType, itemType, videoId });
}

/**
 * @param {string} videoId
 * @param {'citation'|'request'} itemType
 * @returns {Object}  map of itemId → 'up'|'down'|null
 */
async function apiGetUserVotes(videoId, itemType = 'citation') {
    const res = await _send({ type: 'getUserVotes', videoId, itemType });
    return res.votes || {};
}

// ── Reports ──────────────────────────────────

async function apiReportItem({ videoId, itemId, itemType, reason, additionalInfo, username }) {
    return _send({
        type: 'reportItem',
        data: { videoId, itemId, itemType, reason, additionalInfo, reporterUsername: username },
    });
}

// ── SSE ──────────────────────────────────────

/**
 * Build the EventSource URL for real-time updates on a given video.
 * The content script opens this URL directly (EventSource cannot go through
 * the background service worker — SW context cannot maintain open connections).
 *
 * @param {string} videoId
 * @returns {string}
 */
function apiGetSSEUrl(videoId) {
    return `${_CP_API_BASE}/api/events?videoId=${encodeURIComponent(videoId)}`;
}
