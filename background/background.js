// Derive API base from manifest host_permissions — single source of truth.
// Update host_permissions in manifest.json for production; this picks it up automatically.
var API_BASE_URL = (() => {
    try {
        const perm = chrome.runtime.getManifest().host_permissions?.[0] ?? '';
        const base = perm.replace(/\/\*$/, ''); // strip trailing /*
        return base ? base + '/api' : 'http://localhost:3000/api';
    } catch (_) {
        return 'http://localhost:3000/api';
    }
})();

// ── Cross-browser compatibility ───────────────
// Use browser.storage if available (Firefox), then chrome.storage,
// then fall back to a localStorage-backed shim for CI environments.
const _storage = (() => {
    if (typeof browser !== 'undefined' && browser.storage) return browser.storage;
    if (typeof chrome !== 'undefined' && chrome.storage) return chrome.storage;
    // localStorage shim — for environments where neither API is available
    return {
        local: {
            get: (keys, cb) => {
                const result = {};
                const ks = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
                ks.forEach(k => {
                    try {
                        const v = localStorage.getItem(k);
                        result[k] = v ? JSON.parse(v) : undefined;
                    } catch (_) {}
                });
                if (cb) cb(result);
            },
            set: (obj, cb) => {
                Object.entries(obj).forEach(([k, v]) => {
                    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
                });
                if (cb) cb();
            },
            remove: (keys, cb) => {
                const ks = Array.isArray(keys) ? keys : [keys];
                ks.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                if (cb) cb();
            },
        }
    };
})();

// ── In-memory TTL cache ───────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 10_000; // aligned with server max-age=10

function _cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) { _cache.delete(key); return null; }
    return entry.data;
}

function _cacheSet(key, data) {
    _cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate ALL cached pages for a videoId (citations and requests).
 * Called after add / delete mutations.
 */
function _cacheInvalidate(videoId) {
    for (const key of _cache.keys()) {
        if (key.startsWith(`citations:${videoId}`) || key.startsWith(`requests:${videoId}`)) {
            _cache.delete(key);
        }
    }
}

/**
 * Surgically update the voteScore for a single item inside every cached
 * page that contains it, instead of blowing away the whole videoId cache.
 */
function _cacheUpdateItemScore(videoId, itemType, itemId, newScore) {
    const cachePrefix = itemType === 'citation' ? 'citations' : 'requests';
    const listField   = itemType === 'citation' ? 'citations' : 'requests';

    for (const [key, entry] of _cache.entries()) {
        if (!key.startsWith(`${cachePrefix}:${videoId}`)) continue;
        const items = entry.data[listField];
        if (!Array.isArray(items)) continue;
        const item = items.find(i => i.id === itemId);
        if (item) item.voteScore = newScore;
    }
}

// ── Keep alive ────────────────────────────────
setInterval(
    () => fetch(`${API_BASE_URL.replace('/api', '')}/health`).catch(() => {}),
    20_000
);

async function apiRequest(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'getCitations') {
        handleGetCitations(request.videoId, request.page, request.limit).then(sendResponse);
        return true;
    }
    if (request.type === 'addCitation') {
        handleAddCitation(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'deleteCitation') {
        handleDeleteCitation(request.citationId, request.videoId, request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'getCitationRequests') {
        handleGetRequests(request.videoId, request.page, request.limit).then(sendResponse);
        return true;
    }
    if (request.type === 'getRequestsByIds') {
        handleGetRequestsByIds(request.videoId, request.ids).then(sendResponse);
        return true;
    }
    if (request.type === 'addRequest') {
        handleAddRequest(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'deleteRequest') {
        handleDeleteRequest(request.requestId, request.videoId, request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'updateVotes') {
        if (!request.videoId) {
            sendResponse({ success: false, error: 'Video ID is required' });
            return true;
        }
        if (request.itemType === 'citation') {
            handleUpdateCitationVotes(request.videoId, request.itemId, request.voteType).then(sendResponse);
        } else {
            handleUpdateRequestVotes(request.videoId, request.itemId, request.voteType).then(sendResponse);
        }
        return true;
    }
    if (request.type === 'getUserVotes') {
        handleGetUserVotes(request.videoId, request.itemType).then(sendResponse);
        return true;
    }
    if (request.type === 'reportItem') {
        handleReportItem(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'updateCategory') {
        handleUpdateCategory(request.itemType, request.videoId, request.itemId, request.category, request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'checkExpert') {
        handleCheckExpert(request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'getDashboardStats') {
        handleGetDashboardStats(request.videoId).then(sendResponse);
        return true;
    }
    if (request.type === 'applyExpert') {
        handleApplyExpert(request.username, request.category, request.credentials).then(sendResponse);
        return true;
    }
    if (request.type === 'getMyApplications') {
        handleGetMyApplications(request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'getPendingApplications') {
        handleGetPendingApplications().then(sendResponse);
        return true;
    }
    if (request.type === 'reviewApplication') {
        handleReviewApplication(request.id, request.status, request.reviewedBy, request.reason).then(sendResponse);
        return true;
    }
    if (request.type === 'getDiscussionCitation') {
        handleGetDiscussionCitation(request.id).then(sendResponse);
        return true;
    }
    if (request.type === 'getDiscussionRequest') {
        handleGetDiscussionRequest(request.id).then(sendResponse);
        return true;
    }
    if (request.type === 'getNotifications') {
        handleGetNotifications(request.username, request.page).then(sendResponse);
        return true;
    }
    if (request.type === 'markNotificationRead') {
        handleMarkNotificationRead(request.id).then(sendResponse);
        return true;
    }
    if (request.type === 'markAllNotificationsRead') {
        handleMarkAllNotificationsRead(request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'getProfile') {
        handleGetProfile(request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'updateProfile') {
        handleUpdateProfile(request.username, request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'getProfileHistory') {
        handleGetProfileHistory(request.username, request.page).then(sendResponse);
        return true;
    }

    if (request.type === 'upsertVideo') {
        handleUpsertVideo(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'getExpertFeed') {
        handleGetExpertFeed(request.username).then(sendResponse);
        return true;
    }
    if (request.type === 'getGeneralFeed') {
        handleGetGeneralFeed(request.category, request.page, request.limit).then(sendResponse);
        return true;
    }
    
    if (request.type === 'applyExpert') {
        handleApplyExpert(request.username, request.topics, request.credentials).then(sendResponse);
        return true;
    }
});

async function handleGetCitations(videoId, page = 1, limit = 20) {
    const cacheKey = `citations:${videoId}:${page}:${limit}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return { success: true, ...cached };
    try {
        const data = await apiRequest(`/citations/${videoId}?page=${page}&limit=${limit}`);
        const citations = data.citations.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
        const payload = { citations, pagination: data.pagination };
        _cacheSet(cacheKey, payload);
        return { success: true, ...payload };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleAddCitation(data) {
    try {
        const { videoId, ...fields } = data;
        const result = await apiRequest(`/citations/${videoId}`, 'POST', fields);
        _cacheInvalidate(videoId);
        return { success: true, id: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleDeleteCitation(citationId, videoId, username) {
    try {
        await apiRequest(`/citations/${videoId}/${citationId}`, 'DELETE', { username });
        _cacheInvalidate(videoId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetRequests(videoId, page = 1, limit = 20) {
    const cacheKey = `requests:${videoId}:${page}:${limit}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return { success: true, ...cached };
    try {
        const data = await apiRequest(`/requests/${videoId}?page=${page}&limit=${limit}`);
        const requests = data.requests.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
        const payload = { requests, pagination: data.pagination };
        _cacheSet(cacheKey, payload);
        return { success: true, ...payload };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetRequestsByIds(videoId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, requests: [] };

    const uniqueIds = [...new Set(ids)].slice(0, 50);
    const cacheKey = `requests:${videoId}:ids:${[...uniqueIds].sort().join(',')}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return { success: true, ...cached };

    try {
        const data = await apiRequest(
            `/requests/${videoId}/by-ids?ids=${uniqueIds.join(',')}`
        );
        const requests = data.requests.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
        const payload  = { requests };
        _cacheSet(cacheKey, payload);
        return { success: true, ...payload };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleAddRequest(data) {
    try {
        const { videoId, ...fields } = data;
        const result = await apiRequest(`/requests/${videoId}`, 'POST', fields);
        _cacheInvalidate(videoId);
        return { success: true, id: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleDeleteRequest(requestId, videoId, username) {
    try {
        await apiRequest(`/requests/${videoId}/${requestId}`, 'DELETE', { username });
        _cacheInvalidate(videoId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function getStorageKey(itemType, videoId) {
    return `${itemType}_votes_${videoId}`;
}

function computeDelta(voteType, currentVote) {
    if (voteType === currentVote) {
        return voteType === 'up' ? -1 : 1;
    }
    let delta = voteType === 'up' ? 1 : -1;
    if (currentVote) {
        delta += currentVote === 'up' ? -1 : 1;
    }
    return delta;
}

async function handleUpdateCitationVotes(videoId, citationId, voteType) {
    try {
        const storageKey = getStorageKey('citation', videoId);
        const userVotes = await new Promise(resolve =>
            _storage.local.get(storageKey, r => resolve(r[storageKey] || {}))
        );
        const currentVote = userVotes[citationId];
        const delta = computeDelta(voteType, currentVote);
        const result = await apiRequest(`/citations/${videoId}/${citationId}/vote`, 'PATCH', { delta });

        if (voteType === currentVote) {
            delete userVotes[citationId];
        } else {
            userVotes[citationId] = voteType;
        }
        await new Promise(resolve => _storage.local.set({ [storageKey]: userVotes }, resolve));

        _cacheUpdateItemScore(videoId, 'citation', citationId, result.newScore);

        return { success: true, newScore: result.newScore, newVote: userVotes[citationId] || null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleUpdateRequestVotes(videoId, requestId, voteType) {
    try {
        const storageKey = getStorageKey('request', videoId);
        const userVotes = await new Promise(resolve =>
            _storage.local.get(storageKey, r => resolve(r[storageKey] || {}))
        );
        const currentVote = userVotes[requestId];
        const delta = computeDelta(voteType, currentVote);
        const result = await apiRequest(`/requests/${videoId}/${requestId}/vote`, 'PATCH', { delta });

        if (voteType === currentVote) {
            delete userVotes[requestId];
        } else {
            userVotes[requestId] = voteType;
        }
        await new Promise(resolve => _storage.local.set({ [storageKey]: userVotes }, resolve));

        _cacheUpdateItemScore(videoId, 'request', requestId, result.newScore);

        return { success: true, newScore: result.newScore, newVote: userVotes[requestId] || null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetUserVotes(videoId, itemType = 'citation') {
    try {
        const storageKey = getStorageKey(itemType, videoId);
        const votes = await new Promise(resolve =>
            _storage.local.get(storageKey, r => resolve(r[storageKey] || {}))
        );
        return { success: true, votes };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleUpdateCategory(itemType, videoId, itemId, category, username) {
    try {
        const path = itemType === 'citation' ? 'citations' : 'requests';
        const result = await apiRequest(`/${path}/${videoId}/${itemId}/category`, 'PATCH', { category, username });
        _cacheInvalidate(videoId);
        return {
            success: true,
            category: result.category,
            categoryVerified: result.categoryVerified,
            verifiedBy: result.verifiedBy,
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleCheckExpert(username) {
    try {
        const result = await apiRequest(`/experts/${encodeURIComponent(username)}`);
        // Updated to pass expertTopics back to the frontend
        return { 
            success: true, 
            isExpert: result.isExpert,
            expertTopics: result.expertTopics || [] 
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetDashboardStats(videoId) {
    try {
        const query = videoId ? `?videoId=${encodeURIComponent(videoId)}` : '';
        const result = await apiRequest(`/dashboard/trending${query}`);
        return {
            success: true,
            requestsByCategory: result.requestsByCategory,
            citationsByCategory: result.citationsByCategory,
            verificationStats: result.verificationStats,
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleReportItem(data) {
    try {
        const result = await apiRequest('/reports', 'POST', {
            videoId:          data.videoId,
            itemId:           data.itemId,
            itemType:         data.itemType,
            reason:           data.reason,
            additionalInfo:   data.additionalInfo || '',
            reporterUsername: data.reporterUsername,
        });
        return { success: true, reportId: result.reportId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleApplyExpert(username, topics, credentials) {
    try {
        const result = await apiRequest('/experts/apply', 'POST', { username, topics, credentials });
        return { success: true, id: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetMyApplications(username) {
    try {
        const data = await apiRequest(`/experts/applications/${encodeURIComponent(username)}`);
        return { success: true, applications: data.applications || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetPendingApplications() {
    try {
        const data = await apiRequest('/experts/applications/pending');
        return { success: true, applications: data.applications || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleReviewApplication(id, status, reviewedBy, reason) {
    try {
        const result = await apiRequest(`/experts/applications/${id}/review`, 'PATCH', { status, reviewedBy, reason });
        return { success: true, application: result.application };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetProfile(username) {
    try {
        const data = await apiRequest(`/profile/${encodeURIComponent(username)}`);
        return { success: true, ...data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleUpdateProfile(username, data) {
    try {
        const result = await apiRequest(`/profile/${encodeURIComponent(username)}`, 'PUT', data);
        return { success: true, profile: result.profile };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetProfileHistory(username, page = 1) {
    try {
        const data = await apiRequest(`/profile/${encodeURIComponent(username)}/history?page=${page}`);
        return { success: true, citations: data.citations || [], requests: data.requests || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetNotifications(username, page = 1) {
    try {
        const data = await apiRequest(`/notifications/${encodeURIComponent(username)}?page=${page}`);
        return { success: true, notifications: data.notifications || [], unreadCount: data.unreadCount || 0 };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleMarkNotificationRead(id) {
    try {
        await apiRequest(`/notifications/${id}/read`, 'PATCH');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleMarkAllNotificationsRead(username) {
    try {
        await apiRequest(`/notifications/${encodeURIComponent(username)}/read-all`, 'PATCH');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetDiscussionCitation(id) {
    try {
        const data = await apiRequest(`/discussion/citation/${id}`);
        return { success: true, citation: data.citation, replies: data.replies || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetDiscussionRequest(id) {
    try {
        const data = await apiRequest(`/discussion/request/${id}`);
        return { success: true, request: data.request, responses: data.responses || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ── Feeds & Metadata Handlers ──────────────────

async function handleUpsertVideo(data) {
    try {
        const result = await apiRequest('/videos/upsert', 'POST', data);
        return { success: true, data: result.data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetExpertFeed(username) {
    try {
        const result = await apiRequest(`/feeds/expert?username=${encodeURIComponent(username)}`);
        return { success: true, data: result.data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetGeneralFeed(category, page = 1, limit = 20) {
    try {
        const query = new URLSearchParams({ category, page, limit }).toString();
        const result = await apiRequest(`/feeds/general?${query}`);
        return { success: true, data: result.data, pagination: result.pagination };
    } catch (error) {
        return { success: false, error: error.message };
    }
}