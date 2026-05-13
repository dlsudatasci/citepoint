importScripts('../config/config.js');

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
        handleGetCitations(request.videoId).then(sendResponse);
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
        handleGetRequests(request.videoId).then(sendResponse);
        return true;
    }
    if (request.type === 'addRequest') {
        handleAddRequest(request.data).then(sendResponse);
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

async function handleGetCitations(videoId) {
    try {
        const data = await apiRequest(`/citations/${videoId}`);
        const citations = data.citations.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
        return { success: true, citations };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleAddCitation(data) {
    try {
        const { videoId, ...fields } = data;
        const result = await apiRequest(`/citations/${videoId}`, 'POST', fields);
        return { success: true, id: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleDeleteCitation(citationId, videoId) {
    try {
        await apiRequest(`/citations/${videoId}/${citationId}`, 'DELETE');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetRequests(videoId) {
    try {
        const data = await apiRequest(`/requests/${videoId}`);
        const requests = data.requests.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
        return { success: true, requests };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleAddRequest(data) {
    try {
        const { videoId, ...fields } = data;
        const result = await apiRequest(`/requests/${videoId}`, 'POST', fields);
        return { success: true, id: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function getStorageKey(itemType, videoId) {
    return `${itemType}_votes_${videoId}`;
}

function computeDelta(voteType, currentVote) {
    if (voteType === currentVote) {
        // Toggle off
        return voteType === 'up' ? -1 : 1;
    }
    let delta = voteType === 'up' ? 1 : -1;
    if (currentVote) {
        // Undo previous vote before applying new one
        delta += currentVote === 'up' ? -1 : 1;
    }
    return delta;
}

async function handleUpdateCitationVotes(videoId, citationId, voteType) {
    try {
        const storageKey = getStorageKey('citation', videoId);
        const userVotes = await new Promise(resolve =>
            chrome.storage.local.get(storageKey, r => resolve(r[storageKey] || {}))
        );

        const currentVote = userVotes[citationId];
        const delta = computeDelta(voteType, currentVote);

        const result = await apiRequest(`/citations/${videoId}/${citationId}/vote`, 'PATCH', { delta });

        if (voteType === currentVote) {
            delete userVotes[citationId];
        } else {
            userVotes[citationId] = voteType;
        }
        await new Promise(resolve => chrome.storage.local.set({ [storageKey]: userVotes }, resolve));

        return { success: true, newScore: result.newScore, newVote: userVotes[citationId] || null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleUpdateRequestVotes(videoId, requestId, voteType) {
    try {
        const storageKey = getStorageKey('request', videoId);
        const userVotes = await new Promise(resolve =>
            chrome.storage.local.get(storageKey, r => resolve(r[storageKey] || {}))
        );

        const currentVote = userVotes[requestId];
        const delta = computeDelta(voteType, currentVote);

        const result = await apiRequest(`/requests/${videoId}/${requestId}/vote`, 'PATCH', { delta });

        if (voteType === currentVote) {
            delete userVotes[requestId];
        } else {
            userVotes[requestId] = voteType;
        }
        await new Promise(resolve => chrome.storage.local.set({ [storageKey]: userVotes }, resolve));

        return { success: true, newScore: result.newScore, newVote: userVotes[requestId] || null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetUserVotes(videoId, itemType = 'citation') {
    try {
        const storageKey = getStorageKey(itemType, videoId);
        const votes = await new Promise(resolve =>
            chrome.storage.local.get(storageKey, r => resolve(r[storageKey] || {}))
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
