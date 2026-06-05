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