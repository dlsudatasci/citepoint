// ─────────────────────────────────────────────
// api.js
// All communication with background.js lives here.
// Every function returns a Promise that resolves
// with the response data or rejects with an Error.
// ─────────────────────────────────────────────

/**
 * Internal wrapper — send a message to background.js and return the response.
 * Rejects if response.success is false.
 */
async function _send(payload) {
    const response = await chrome.runtime.sendMessage(payload);
    if (!response.success) throw new Error(response.error || 'Unknown error from background');
    return response;
}

// ── Citations ────────────────────────────────

async function apiGetCitations(videoId) {
    const res = await _send({ type: 'getCitations', videoId });
    return res.citations || [];
}

async function apiAddCitation(citationData) {
    return _send({ type: 'addCitation', data: citationData });
}

async function apiDeleteCitation(citationId, videoId) {
    return _send({ type: 'deleteCitation', citationId, videoId });
}

// ── Citation Requests ────────────────────────

async function apiGetRequests(videoId) {
    const res = await _send({ type: 'getCitationRequests', videoId });
    return res.requests || [];
}

async function apiAddRequest(requestData) {
    return _send({ type: 'addRequest', data: requestData });
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
    return _send({ type: 'reportItem', data: { videoId, itemId, itemType, reason, additionalInfo, username } });
}
