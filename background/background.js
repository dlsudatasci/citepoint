// First line of background.js
var API_BASE_URL = "http://localhost:3000/api";

// ── Cross-browser compatibility ───────────────
const _storage = (typeof browser !== 'undefined' && browser.storage)
    ? browser.storage
    : chrome.storage;

// ── In-memory TTL cache ───────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 15_000;

function _cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) { _cache.delete(key); return null; }
    return entry.data;
}

function _cacheSet(key, data) {
    _cache.set(key, { data, timestamp: Date.now() });
}

function _cacheInvalidate(videoId) {
    for (const key of _cache.keys()) {
        if (key.startsWith(`citations:${videoId}`) || key.startsWith(`requests:${videoId}`)) {
            _cache.delete(key);
        }
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
        handleDeleteCitation(request.citationId, request.videoId).then(sendResponse);
        return true;
    }
    if (request.type === 'getCitationRequests') {
        handleGetRequests(request.videoId, request.page, request.limit).then(sendResponse);
        return true;
    }
    if (request.type === 'addRequest') {
        handleAddRequest(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'deleteRequest') {
        handleDeleteRequest(request.requestId, request.videoId).then(sendResponse);
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

async function handleDeleteCitation(citationId, videoId) {
    try {
        await apiRequest(`/citations/${videoId}/${citationId}`, 'DELETE');
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

async function handleDeleteRequest(requestId, videoId) {
    try {
        await apiRequest(`/requests/${videoId}/${requestId}`, 'DELETE');
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
            videoId: data.videoId,
            itemId: data.itemId,
            itemType: data.itemType,
            reason: data.reason,
            additionalInfo: data.additionalInfo || '',
        });
        return { success: true, reportId: result.reportId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}