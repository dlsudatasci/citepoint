// ─────────────────────────────────────────────
// api.js
// Direct HTTP fetch from the content-script context (youtube.com).
// Bypasses background.js so Firefox's mixed-content block on the
// moz-extension:// context does not apply — the request origin
// becomes https://www.youtube.com, which the server already allows.
// ─────────────────────────────────────────────

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
        return perm.replace(/\/\*$/, '');
    } catch (_) {
        return 'http://localhost:3000';
    }
})();

// ── TTL cache ─────────────────────────────────
const _cache = new Map();
const _CACHE_TTL_MS = 10_000;

function _cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > _CACHE_TTL_MS) { _cache.delete(key); return null; }
    return entry.data;
}

function _cacheSet(key, data) {
    _cache.set(key, { data, ts: Date.now() });
}

function _cacheInvalidate(videoId) {
    for (const key of _cache.keys()) {
        if (key.startsWith(`citations:${videoId}`) || key.startsWith(`requests:${videoId}`)) {
            _cache.delete(key);
        }
    }
}

function _cacheUpdateItemScore(videoId, itemType, itemId, newScore) {
    const prefix = itemType === 'citation' ? 'citations' : 'requests';
    const field  = itemType === 'citation' ? 'citations' : 'requests';
    for (const [key, entry] of _cache.entries()) {
        if (!key.startsWith(`${prefix}:${videoId}`)) continue;
        const items = entry.data[field];
        if (!Array.isArray(items)) continue;
        const item = items.find(i => i.id === itemId);
        if (item) item.voteScore = newScore;
    }
}

// ── Vote storage ──────────────────────────────
const _voteStore = (() => {
    if (typeof browser !== 'undefined' && browser.storage?.local) return browser.storage.local;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
    return null;
})();

function _getVotes(key) {
    if (!_voteStore) return Promise.resolve({});
    return new Promise(resolve => _voteStore.get(key, r => resolve(r[key] || {})));
}

function _setVotes(key, data) {
    if (!_voteStore) return Promise.resolve();
    return new Promise(resolve => _voteStore.set({ [key]: data }, resolve));
}

// ── HTTP helper ───────────────────────────────
async function _apiRequest(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${_CP_API_BASE}/api${path}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function _mapId({ _id, ...rest }) {
    return { id: _id, ...rest };
}

// ── Citations ────────────────────────────────

async function apiGetCitations(videoId, page = 1, limit = 20) {
    const key = `citations:${videoId}:${page}:${limit}`;
    const cached = _cacheGet(key);
    if (cached) return cached;
    const data = await _apiRequest(`/citations/${videoId}?page=${page}&limit=${limit}`);
    const result = { citations: data.citations.map(_mapId), pagination: data.pagination };
    _cacheSet(key, result);
    return result;
}

async function apiAddCitation(citationData) {
    const { videoId, ...fields } = citationData;
    const result = await _apiRequest(`/citations/${videoId}`, 'POST', fields);
    _cacheInvalidate(videoId);
    return { success: true, id: result.id };
}

async function apiDeleteCitation(citationId, videoId, username) {
    await _apiRequest(`/citations/${videoId}/${citationId}`, 'DELETE', { username });
    _cacheInvalidate(videoId);
    return { success: true };
}

// ── Citation Requests ────────────────────────

async function apiGetRequests(videoId, page = 1, limit = 20) {
    const key = `requests:${videoId}:${page}:${limit}`;
    const cached = _cacheGet(key);
    if (cached) return cached;
    const data = await _apiRequest(`/requests/${videoId}?page=${page}&limit=${limit}`);
    const result = { requests: data.requests.map(_mapId), pagination: data.pagination };
    _cacheSet(key, result);
    return result;
}

async function apiGetRequestsByIds(videoId, ids) {
    if (!ids || ids.length === 0) return { requests: [] };
    const uniqueIds = [...new Set(ids)].slice(0, 50);
    const key = `requests:${videoId}:ids:${[...uniqueIds].sort().join(',')}`;
    const cached = _cacheGet(key);
    if (cached) return cached;
    const data = await _apiRequest(`/requests/${videoId}/by-ids?ids=${uniqueIds.join(',')}`);
    const result = { requests: data.requests.map(_mapId) };
    _cacheSet(key, result);
    return result;
}

async function apiAddRequest(requestData) {
    const { videoId, ...fields } = requestData;
    const result = await _apiRequest(`/requests/${videoId}`, 'POST', fields);
    _cacheInvalidate(videoId);
    return { success: true, id: result.id };
}

async function apiDeleteRequest(requestId, videoId, username) {
    await _apiRequest(`/requests/${videoId}/${requestId}`, 'DELETE', { username });
    _cacheInvalidate(videoId);
    return { success: true };
}

// ── Votes ────────────────────────────────────

function _computeDelta(voteType, currentVote) {
    if (voteType === currentVote) return voteType === 'up' ? -1 : 1;
    let delta = voteType === 'up' ? 1 : -1;
    if (currentVote) delta += currentVote === 'up' ? -1 : 1;
    return delta;
}

async function apiUpdateVote(itemId, voteType, itemType, videoId, username) {
    const storageKey = `${itemType}_votes_${videoId}`;
    const userVotes  = await _getVotes(storageKey);
    const currentVote = userVotes[itemId];
    const delta = _computeDelta(voteType, currentVote);

    const path = itemType === 'citation'
        ? `/citations/${videoId}/${itemId}/vote`
        : `/requests/${videoId}/${itemId}/vote`;
    const result = await _apiRequest(path, 'PATCH', { delta, username });

    if (voteType === currentVote) {
        delete userVotes[itemId];
    } else {
        userVotes[itemId] = voteType;
    }
    await _setVotes(storageKey, userVotes);
    _cacheUpdateItemScore(videoId, itemType, itemId, result.newScore);

    return { success: true, newScore: result.newScore, newVote: userVotes[itemId] || null };
}

async function apiGetUserVotes(videoId, itemType = 'citation') {
    return _getVotes(`${itemType}_votes_${videoId}`);
}

// ── Reports ──────────────────────────────────

async function apiReportItem({ videoId, itemId, itemType, reason, additionalInfo, username }) {
    const result = await _apiRequest('/reports', 'POST', {
        videoId, itemId, itemType, reason,
        additionalInfo:   additionalInfo || '',
        reporterUsername: username,
    });
    return { success: true, reportId: result.reportId };
}

// ── Discussion / Replies ────────────────────

async function apiGetDiscussionTree(id) {
    const data = await _apiRequest(`/discussion/citation/${id}?tree=true`);
    return { success: true, citation: data.citation, replies: data.replies || [] };
}

async function apiGetDiscussionRequest(id) {
    const data = await _apiRequest(`/discussion/request/${id}`);
    return { success: true, request: data.request, responses: data.responses || [] };
}

async function apiAddQuickReply(parentCitationId, description, videoId, username) {
    const data = await _apiRequest('/discussion/reply', 'POST', {
        parentCitationId, description, videoId, username,
    });
    return { success: true, id: data.id };
}

// ── My Discussions (dashboard hub) ──────────

async function apiGetMyDiscussions(username, filter = 'all', page = 1, search = '') {
    const query = new URLSearchParams({ username, filter, page, search: search || '' }).toString();
    const result = await _apiRequest(`/discussions/mine?${query}`);
    return { discussions: result.discussions || [], pagination: result.pagination || null };
}

// ── SSE ──────────────────────────────────────

function apiGetSSEUrl(videoId) {
    return `${_CP_API_BASE}/api/events?videoId=${encodeURIComponent(videoId)}`;
}

// ── Categories & Experts ──────────────────────

async function apiUpdateCategory(itemId, itemType, videoId, category, username) {
    const path = itemType === 'citation' ? 'citations' : 'requests';
    const result = await _apiRequest(`/${path}/${videoId}/${itemId}/category`, 'PATCH', { category, username });
    _cacheInvalidate(videoId);
    return { success: true, category: result.category, categoryVerified: result.categoryVerified, verifiedBy: result.verifiedBy };
}

async function apiUpdateResolved(itemId, itemType, videoId, resolved, username) {
    const path = itemType === 'citation' ? 'citations' : 'requests';
    const result = await _apiRequest(`/${path}/${videoId}/${itemId}/resolve`, 'PATCH', { resolved, username });
    _cacheInvalidate(videoId);
    return { success: true, resolved: result.resolved, resolvedBy: result.resolvedBy, resolvedAt: result.resolvedAt };
}

async function apiGetFollowStatus(itemId, itemType, username) {
    const result = await _apiRequest(`/follows/${itemType}/${itemId}?username=${encodeURIComponent(username)}`);
    return !!result.following;
}

async function apiUpdateFollow(itemId, itemType, following, username) {
    const result = await _apiRequest(`/follows/${itemType}/${itemId}`, 'PATCH', { following, username });
    return !!result.following;
}

async function apiCheckExpert(username) {
    const result = await _apiRequest(`/experts/${encodeURIComponent(username)}`);
    return { isExpert: !!result.isExpert, topics: result.topics || [] };
}

async function apiApplyExpert(username, topics, credentials) {
    return _apiRequest('/experts/apply', 'POST', { username, topics, credentials });
}

async function apiGetMyApplications(username) {
    const data = await _apiRequest(`/experts/applications/${encodeURIComponent(username)}?requesterUsername=${encodeURIComponent(username)}`);
    return data.applications || [];
}

async function apiGetPendingApplications(adminUsername) {
    const data = await _apiRequest(`/experts/applications/pending?adminUsername=${encodeURIComponent(adminUsername || '')}`);
    return data.applications || [];
}

async function apiReviewApplication(id, status, reviewedBy, reason) {
    return _apiRequest(`/experts/applications/${id}/review`, 'PATCH', { status, reviewedBy, reason });
}

// ── Profile ──────────────────────────────────

async function apiGetProfile(username) {
    const data = await _apiRequest(`/profile/${encodeURIComponent(username)}`);
    return { success: true, ...data };
}

async function apiUpdateProfile(username, data) {
    const result = await _apiRequest(`/profile/${encodeURIComponent(username)}`, 'PUT', {
        ...data,
        requesterUsername: username,
    });
    return { success: true, profile: result.profile };
}

async function apiGetProfileHistory(username, page) {
    const data = await _apiRequest(`/profile/${encodeURIComponent(username)}/history?page=${page}`);
    return { success: true, citations: data.citations || [], requests: data.requests || [] };
}

// ── Notifications ────────────────────────────

async function apiGetNotifications(username, page) {
    const data = await _apiRequest(`/notifications/${encodeURIComponent(username)}?page=${page}`);
    return { success: true, notifications: data.notifications || [], unreadCount: data.unreadCount || 0 };
}

async function apiMarkNotificationRead(id, username) {
    await _apiRequest(`/notifications/${id}/read`, 'PATCH', { username });
    return { success: true };
}

async function apiMarkAllNotificationsRead(username) {
    await _apiRequest(`/notifications/${encodeURIComponent(username)}/read-all`, 'PATCH', { username });
    return { success: true };
}

// ── Dashboard ─────────────────────────────────

async function apiGetDashboardStats(videoId) {
    const query = videoId ? `?videoId=${encodeURIComponent(videoId)}` : '';
    const result = await _apiRequest(`/dashboard/trending${query}`);
    return {
        requestsByCategory:  result.requestsByCategory  || [],
        citationsByCategory: result.citationsByCategory || [],
        verificationStats:   result.verificationStats   || { citations: [], requests: [] },
    };
}

// ── Feeds & Video Metadata ───────────────────

async function apiUpsertVideo(metadata) {
    const result = await _apiRequest('/videos/upsert', 'POST', metadata);
    return { success: true, data: result.data };
}

async function apiGetExpertFeed(username) {
    const result = await _apiRequest(`/feeds/expert?username=${encodeURIComponent(username)}`);
    return result.data || [];
}

async function apiGetGeneralFeed(topic = 'All', page = 1, limit = 20) {
    const query = new URLSearchParams({ topic, page, limit }).toString();
    const result = await _apiRequest(`/feeds/general?${query}`);
    return { feed: result.data || [], pagination: result.pagination || null };
}
