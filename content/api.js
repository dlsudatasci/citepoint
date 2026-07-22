// ─────────────────────────────────────────────
// api.js
// All communication with background.js lives here.
// Every function returns a Promise that resolves
// with the response data or rejects with an Error.
// ─────────────────────────────────────────────

// Derive the API base from manifest.json host_permissions so the URL is defined in
// exactly one place. Update manifest.json for production deployments.
//
// The API host is identified by NOT being a known YouTube pattern, rather than by
// trusting a fixed array position — host_permissions can be freely reordered without
// silently repointing every API call at the wrong origin.
const _CP_YOUTUBE_HOST_PATTERNS = [/^\*:\/\/(www\.)?youtube\.com\//, /^\*:\/\/m\.youtube\.com\//];

function _deriveApiBasePermission(hostPermissions) {
    const perms = hostPermissions || [];
    const apiCandidates = perms.filter(p => !_CP_YOUTUBE_HOST_PATTERNS.some(re => re.test(p)));
    if (apiCandidates.length === 0) {
        console.error('[api] No non-YouTube host_permissions entry found — cannot determine API base URL.');
        return '';
    }
    return apiCandidates[0];
}

const _CP_API_BASE = (() => {
    try {
        const perm = _deriveApiBasePermission(chrome.runtime.getManifest().host_permissions);
        return perm.replace(/\/\*$/, ''); // strip trailing /*
    } catch (_) {
        return 'http://localhost:3000';   // safe fallback
    }
})();

// ── Cross-browser runtime ─────────────────────
// Firefox exposes `browser`, Chrome exposes `chrome`.
// Both are available via the browser-polyfill, but guard anyway.
const _runtime = (() => {
    if (typeof browser !== 'undefined' && browser.runtime) return browser.runtime;
    if (typeof chrome !== 'undefined' && chrome.runtime) return chrome.runtime;
    return null;
})();

/**
 * Internal wrapper — send a message to background.js and return the response.
 * Rejects if response.success is false.
 */
async function _send(payload) {
    return new Promise((resolve, reject) => {
        try {
            if (!_runtime) {
                return reject(new Error('No runtime API available'));
            }
            _runtime.sendMessage(payload, (response) => {
                const lastError = _runtime.lastError;
                if (lastError) {
                    return reject(new Error(lastError.message));
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

async function apiUpdateVote(itemId, voteType, itemType, videoId, username) {
    return _send({ type: 'updateVotes', itemId, voteType, itemType, videoId, username });
}

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

// ── Discussion / Replies ────────────────────

async function apiGetDiscussionTree(id) {
    return _send({ type: 'getDiscussionCitationTree', id });
}

async function apiGetDiscussionRequest(id) {
    return _send({ type: 'getDiscussionRequest', id });
}

async function apiAddQuickReply(parentCitationId, description, videoId, username) {
    return _send({ type: 'addQuickReply', parentCitationId, description, videoId, username });
}

// ── My Discussions (dashboard hub) ──────────

/**
 * @param {string} username
 * @param {'all'|'mine'|'requests'|'participated'|'unread'} filter
 * @param {number} page
 * @param {string} search
 */
async function apiGetMyDiscussions(username, filter = 'all', page = 1, search = '') {
    const res = await _send({ type: 'getMyDiscussions', username, filter, page, search });
    return { discussions: res.discussions || [], pagination: res.pagination || null };
}

// ── SSE ──────────────────────────────────────

function apiGetSSEUrl(videoId) {
    return `${_CP_API_BASE}/api/events?videoId=${encodeURIComponent(videoId)}`;
}

// ── Categories & Experts ──────────────────────

/**
 * @param {string} itemId
 * @param {'citation'|'request'} itemType
 * @param {string} videoId
 * @param {string} category
 * @param {string} username
 */
async function apiUpdateCategory(itemId, itemType, videoId, category, username) {
    return _send({ type: 'updateCategory', itemId, itemType, videoId, category, username });
}

/**
 * @param {string} itemId
 * @param {'citation'|'request'} itemType
 * @param {string} videoId
 * @param {boolean} resolved
 * @param {string} username  — must be the item's author or a recognized expert
 */
async function apiUpdateResolved(itemId, itemType, videoId, resolved, username) {
    return _send({ type: 'updateResolved', itemId, itemType, videoId, resolved, username });
}

async function apiCheckExpert(username) {
    const res = await _send({ type: 'checkExpert', username });
    return {
        isExpert: !!res.isExpert,
        topics: res.topics || [],
    };
}

async function apiApplyExpert(username, topics, credentials) {
    return _send({ type: 'applyExpert', username, topics, credentials });
}

async function apiGetMyApplications(username) {
    const res = await _send({ type: 'getMyApplications', username });
    return res.applications || [];
}

async function apiGetPendingApplications(adminUsername) {
    const res = await _send({ type: 'getPendingApplications', adminUsername });
    return res.applications || [];
}

async function apiReviewApplication(id, status, reviewedBy, reason) {
    return _send({ type: 'reviewApplication', id, status, reviewedBy, reason });
}

// ── Profile ──────────────────────────────────

async function apiGetProfile(username) {
    return _send({ type: 'getProfile', username });
}

async function apiUpdateProfile(username, data) {
    return _send({ type: 'updateProfile', username, data });
}

async function apiGetProfileHistory(username, page) {
    return _send({ type: 'getProfileHistory', username, page });
}

// ── Notifications ────────────────────────────

async function apiGetNotifications(username, page) {
    return _send({ type: 'getNotifications', username, page });
}

async function apiMarkNotificationRead(id, username) {
    return _send({ type: 'markNotificationRead', id, username });
}

async function apiMarkAllNotificationsRead(username) {
    return _send({ type: 'markAllNotificationsRead', username });
}

// ── Dashboard ─────────────────────────────────

async function apiGetDashboardStats(videoId) {
    const res = await _send({ type: 'getDashboardStats', videoId });
    return {
        requestsByCategory: res.requestsByCategory || [],
        citationsByCategory: res.citationsByCategory || [],
        verificationStats: res.verificationStats || { citations: [], requests: [] },
    };
}

// ── Feeds & Video Metadata ───────────────────

/**
 * Sends scraped YouTube metadata to the backend for caching/upserting.
 * @param {Object} metadata - { videoId, title, channelName, rawTags }
 */
async function apiUpsertVideo(metadata) {
    return _send({ type: 'upsertVideo', data: metadata });
}

/**
 * Fetches the personalized feed for an expert based on their assigned Topics.
 * @param {string} username
 */
async function apiGetExpertFeed(username) {
    const res = await _send({ type: 'getExpertFeed', username });
    return res.data || [];
}

/**
 * Fetches the general browsable feed, optionally filtered by a video Topic
 * (backend/routes/feeds.js matches against the linked video's youtubeTopics).
 * @param {string} topic
 * @param {number} page
 * @param {number} limit
 */
async function apiGetGeneralFeed(topic = 'All', page = 1, limit = 20) {
    const res = await _send({ type: 'getGeneralFeed', topic, page, limit });
    return {
        feed: res.data || [],
        pagination: res.pagination || null,
    };
}
