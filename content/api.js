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
