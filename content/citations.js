// ─────────────────────────────────────────────
// citations.js
// Citation and Citation Request rendering,
// loading from the Express backend, and list sorting.
// Depends on: api.js, utils.js, username.js, voting.js
// ─────────────────────────────────────────────

// ── Module state ──────────────────────────────

let currentCitations   = [];
let currentRequests    = [];
let userVotes          = {};
let currentSortOption  = 'upvotes';
let currentTime        = 0; // updated by player.js

let _citationsLoading  = false;
let _requestsLoading   = false;
let _pollInterval      = null;
let _requestsById      = {}; // request objects keyed by id, for grouping response citations
let _currentUsername   = null; // cached once per load so re-renders don't need to re-fetch

// ── Load functions ────────────────────────────

/**
 * @param {number}  page
 * @param {boolean} silent  When true, existing content stays visible during refetch (no skeleton flash).
 *                          Use for post-submit refreshes and tab switches when data is already loaded.
 */
async function loadCitations(page = 1, silent = false) {
    if (_citationsLoading) return;
    const container = document.getElementById('citations-container');
    if (!container) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    _citationsLoading = true;

    // Show skeleton only on first load or explicit non-silent page-1 call
    if (page === 1) {
        if (!silent || currentCitations.length === 0) {
            _showLoading(container);
        }
        _updateCounter('citations-counter', '…');
    }

    try {
        const [{ citations, pagination }, votes] = await Promise.all([
            apiGetCitations(videoId, page),
            apiGetUserVotes(videoId, 'citation'),
        ]);

        // Merge fetched votes with any in-flight optimistic votes so vote buttons don't flicker back
        userVotes = { ...userVotes, ...votes };

        citations.forEach(c => {
            c.voteScore = Number(c.voteScore ?? 0);
            c.dateAdded = normalizeDateAdded(c.dateAdded);
        });

        const username = await getYouTubeUsername();
        if (username) {
            chrome.storage.local.set({ youtubeUsername: username });
            _currentUsername = username;
        } else {
            _currentUsername = await getCachedUsername();
        }

        const sorted = sortItems(citations, currentSortOption, 'citation');

        if (page === 1) {
            const hasResponses = sorted.some(c => c.requestId);
            if (hasResponses) {
                try {
                    const { requests } = await apiGetRequests(videoId, 1, 200);
                    _requestsById = Object.fromEntries(requests.map(r => [r.id, r]));
                } catch (e) {
                    console.warn('[citations] Could not fetch requests for grouping:', e);
                    _requestsById = {};
                }
            } else {
                _requestsById = {};
            }
        }

        if (container.style.display !== 'none') {
            if (page === 1) {
                currentCitations = sorted;
                await _renderCitationsWithSections(sorted, container, pagination);
            } else if (!_isSameList(sorted, currentCitations.slice(-sorted.length))) {
                currentCitations = [...currentCitations, ...sorted];
                await _appendCitationsPage(sorted, container, pagination);
            }
        }

        _updateCounter('citations-counter', pagination ? pagination.total : citations.length);

    } catch (err) {
        console.error('[citations] Error loading citations:', err);
        if (container.style.display !== 'none') {
            container.innerHTML = `<p class="error-message">Error loading citations: ${err.message}</p>`;
        }
        _updateCounter('citations-counter', 0);
    } finally {
        _citationsLoading = false;
    }
}

/**
 * @param {number}  page
 * @param {boolean} silent  Skip skeleton when re-fetching after a mutation or tab switch.
 */
async function loadCitationRequests(page = 1, silent = false) {
    if (_requestsLoading) return;
    const container = document.getElementById('citation-requests-container');
    if (!container) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    _requestsLoading = true;

    if (page === 1) {
        if (!silent || currentRequests.length === 0) {
            _showLoading(container);
        }
        _updateCounter('requests-counter', '…');
    }

    try {
        const [{ requests, pagination }, votes] = await Promise.all([
            apiGetRequests(videoId, page),
            apiGetUserVotes(videoId, 'request'),
        ]);

        // Merge to preserve optimistic vote state
        userVotes = { ...userVotes, ...votes };

        requests.forEach(r => {
            r.voteScore  = Number(r.voteScore ?? 0);
            r.dateAdded  = normalizeDateAdded(r.dateAdded);
        });

        _currentUsername = _currentUsername || await getCachedUsername();

        const sorted = sortItems(requests, currentSortOption, 'request');

        if (container.style.display !== 'none') {
            if (page === 1) {
                currentRequests = sorted;
                updateRequestsList(sorted, container, pagination, _currentUsername);
            } else if (!_isSameList(sorted, currentRequests.slice(-sorted.length))) {
                currentRequests = [...currentRequests, ...sorted];
                _appendRequestsPage(sorted, container, pagination, _currentUsername);
            }
        }

        _updateCounter('requests-counter', pagination ? pagination.total : requests.length);

    } catch (err) {
        console.error('[citations] Error loading requests:', err);
        if (container.style.display !== 'none') {
            container.innerHTML = `<p class="error-message">Error loading requests: ${err.message}</p>`;
        }
        _updateCounter('requests-counter', 0);
    } finally {
        _requestsLoading = false;
    }
}

// ── Sorting ───────────────────────────────────

function sortItems(items, sortBy, itemType = 'citation') {
    if (!Array.isArray(items)) return [];

    const isHighlighted = item => {
        const start = parseTimestamp(item.timestampStart);
        const end   = parseTimestamp(item.timestampEnd);
        return currentTime >= start && currentTime <= end;
    };

    const highlighted = items.filter(isHighlighted);
    const normal      = items.filter(item => !isHighlighted(item));

    const sortFn = (a, b) => {
        if (sortBy === 'upvotes') {
            const diff = Number(b.voteScore ?? 0) - Number(a.voteScore ?? 0);
            if (diff !== 0) return diff;
        }
        const dateA = new Date(a.dateAdded).getTime() || 0;
        const dateB = new Date(b.dateAdded).getTime() || 0;
        return dateB - dateA;
    };

    return [...highlighted.sort(sortFn), ...normal.sort(sortFn)];
}

// ── Rendering ─────────────────────────────────

async function _renderCitationsWithSections(citations, container, pagination = null) {
    container.innerHTML = '';

    if (citations.length === 0) {
        container.innerHTML = '<p>No citations found for this video.</p>';
        return;
    }

    const currentUsername = _currentUsername || await getCachedUsername();

    const groups    = new Map();
    const standalone = [];

    for (const c of citations) {
        if (c.requestId && _requestsById[c.requestId]) {
            if (!groups.has(c.requestId)) groups.set(c.requestId, []);
            groups.get(c.requestId).push(c);
        } else {
            standalone.push(c);
        }
    }

    const standaloneEls = await Promise.all(
        standalone.map(c => createCitationElement(c, userVotes[c.id] || null, currentUsername))
    );
    const groupEls = await Promise.all(
        [...groups.entries()].map(([requestId, responses]) =>
            createRequestResponseGroupElement(_requestsById[requestId], responses, userVotes, currentUsername)
        )
    );

    const allElements = [...standaloneEls, ...groupEls];

    const highlighted = allElements.filter(el =>
        parseFloat(el.dataset.start) <= currentTime && currentTime <= parseFloat(el.dataset.end)
    );
    const normal = allElements.filter(el => !highlighted.includes(el));

    if (highlighted.length > 0) {
        const header = document.createElement('div');
        header.className   = 'section-header';
        header.textContent = 'Current Timestamps';
        container.appendChild(header);
        highlighted.forEach(el => container.appendChild(el));
    }

    if (normal.length > 0) {
        if (highlighted.length > 0) container.appendChild(document.createElement('br'));
        const header = document.createElement('div');
        header.className   = 'section-header';
        header.textContent = highlighted.length > 0 ? 'Other Citations' : 'Citations';
        container.appendChild(header);
        normal.forEach(el => container.appendChild(el));
    }

    if (pagination && pagination.page < pagination.pages) {
        const remaining = pagination.total - pagination.page * pagination.limit;
        const loadMore = document.createElement('button');
        loadMore.className   = 'cp-load-more-btn';
        loadMore.textContent = `Load more (${remaining} remaining)`;
        loadMore.addEventListener('click', () => loadCitations(pagination.page + 1));
        container.appendChild(loadMore);
    }

    requestAnimationFrame(updateHighlighting);
}

async function createCitationElement(citation, userVote, currentUsername = null) {
    const el = document.createElement('div');
    el.className      = 'citation-item';
    el.dataset.start  = parseTimestamp(citation.timestampStart);
    el.dataset.end    = parseTimestamp(citation.timestampEnd);

    const canDelete = currentUsername && currentUsername === citation.username;

    const isResponse = citation.description?.startsWith('Response to request:');
    const displayDescription = isResponse
        ? citation.description.split('\n\n').slice(1).join('\n\n').trim()
        : citation.description;

    const authorLink = _buildAuthorLink(citation.username);

    el.innerHTML = `
        <div class="citation-header">
            <span class="citation-title">${_escapeHtml(citation.citationTitle || 'Untitled')}</span>
        </div>
        <div class="citation-timestamp">
            <button class="timestamp-btn" data-time="${parseTimestamp(citation.timestampStart)}">
                ${_escapeHtml(citation.timestampStart)}
            </button>
            to
            <button class="timestamp-btn" data-time="${parseTimestamp(citation.timestampEnd)}">
                ${_escapeHtml(citation.timestampEnd)}
            </button>
        </div>
        <div class="citation-meta">
            ${authorLink}
            <span class="citation-date"> · ${_formatDate(citation.dateAdded)}</span>
        </div>
        ${isResponse ? '<span class="response-badge">Response</span>' : ''}
        <p class="citation-description">${_escapeHtml(displayDescription || '')}</p>
        ${_safeSourceLink(citation.source)}
        <div class="citation-actions">
            <div class="vote-controls" data-citation-id="${citation.id}">
                <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                <span class="vote-score">${citation.voteScore ?? 0}</span>
                <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
            </div>
            <div class="action-buttons">
                ${canDelete ? `<button class="action-btn delete-btn" data-id="${citation.id}">Delete</button>` : ''}
                ${!canDelete ? `<button class="action-btn report-btn" data-id="${citation.id}">Report</button>` : ''}
            </div>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    const voteControls = el.querySelector('.vote-controls');
    voteControls.querySelector('.upvote-btn').addEventListener('click', () =>
        handleVote(citation.id, 'up', 'citation')
    );
    voteControls.querySelector('.downvote-btn').addEventListener('click', () =>
        handleVote(citation.id, 'down', 'citation')
    );

    if (canDelete) {
        el.querySelector('.delete-btn').addEventListener('click', async () => {
            if (!confirm('Delete this citation?')) return;
            try {
                await apiDeleteCitation(citation.id, getCurrentVideoId(), currentUsername);
                loadCitations(1, true);
            } catch (err) {
                showToast('Failed to delete citation. Please try again.', 'error');
            }
        });
    }

    if (!canDelete) {
        el.querySelector('.report-btn')?.addEventListener('click', () =>
            showReportDialog(citation.id, 'citation')
        );
    }

    return el;
}

async function createRequestResponseGroupElement(request, responseCitations, votes, currentUsername) {
    const el = document.createElement('div');
    el.className     = 'citation-item request-response-group';
    el.dataset.start = parseTimestamp(request.timestampStart);
    el.dataset.end   = parseTimestamp(request.timestampEnd);

    el.innerHTML = `
        <div class="citation-header">
            <span class="citation-title">${_escapeHtml(request.title || 'Untitled Request')}</span>
            <span class="citation-timestamp">
                <button class="timestamp-btn" data-time="${parseTimestamp(request.timestampStart)}">
                    ${_escapeHtml(request.timestampStart)}
                </button>
                –
                <button class="timestamp-btn" data-time="${parseTimestamp(request.timestampEnd)}">
                    ${_escapeHtml(request.timestampEnd)}
                </button>
            </span>
        </div>
        <span class="request-badge">Citation Request</span>
        <p class="citation-description">${_escapeHtml(request.reason || '')}</p>
        <div class="citation-meta">
            <span class="citation-author">${_escapeHtml(request.username || 'Anonymous')}</span>
            <span class="citation-date">${_formatDate(request.dateAdded)}</span>
        </div>
        <div class="rg-divider"></div>
        <div class="rg-responses">
            <span class="rg-responses-label">${responseCitations.length} Response${responseCitations.length !== 1 ? 's' : ''}</span>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    const responsesContainer = el.querySelector('.rg-responses');

    for (const citation of responseCitations) {
        const userVote  = votes[citation.id] || null;
        const canDelete = currentUsername && currentUsername === citation.username;

        const responseEl = document.createElement('div');
        responseEl.className = 'rg-response-entry';
        responseEl.innerHTML = `
            <p class="citation-description">${_escapeHtml(citation.description || '')}</p>
            ${_safeSourceLink(citation.source)}
            <div class="citation-meta">
                <span class="citation-author">${_escapeHtml(citation.username || 'Anonymous')}</span>
                <span class="citation-date">${_formatDate(citation.dateAdded)}</span>
            </div>
            <div class="citation-actions">
                <div class="vote-controls" data-citation-id="${citation.id}">
                    <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                    <span class="vote-score">${citation.voteScore ?? 0}</span>
                    <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
                </div>
                <div class="action-buttons">
                    ${canDelete ? `<button class="action-btn delete-btn" data-id="${citation.id}">Delete</button>` : ''}
                    ${!canDelete ? `<button class="action-btn report-btn" data-id="${citation.id}">Report</button>` : ''}
                </div>
            </div>
        `;

        const vc = responseEl.querySelector('.vote-controls');
        vc.querySelector('.upvote-btn').addEventListener('click', () =>
            handleVote(citation.id, 'up', 'citation')
        );
        vc.querySelector('.downvote-btn').addEventListener('click', () =>
            handleVote(citation.id, 'down', 'citation')
        );

        if (canDelete) {
            responseEl.querySelector('.delete-btn').addEventListener('click', async () => {
                if (!confirm('Delete this citation?')) return;
                try {
                    await apiDeleteCitation(citation.id, getCurrentVideoId(), currentUsername);
                    loadCitations(1, true);
                } catch (err) {
                    showToast('Failed to delete citation. Please try again.', 'error');
                }
            });
        }

        if (!canDelete) {
            responseEl.querySelector('.report-btn')?.addEventListener('click', () =>
                showReportDialog(citation.id, 'citation')
            );
        }

        responsesContainer.appendChild(responseEl);
    }

    return el;
}

function createRequestElement(request, userVote, currentUsername = null) {
    const el = document.createElement('div');
    el.className = 'citation-item request-item';
    el.dataset.start = parseTimestamp(request.timestampStart);
    el.dataset.end   = parseTimestamp(request.timestampEnd);

    const canDelete = currentUsername && currentUsername === request.username;

    el.innerHTML = `
        <div class="citation-header">
            <span class="citation-title">${_escapeHtml(request.title || 'Untitled Request')}</span>
            <span class="citation-timestamp">
                <button class="timestamp-btn" data-time="${parseTimestamp(request.timestampStart)}">
                    ${_escapeHtml(request.timestampStart)}
                </button>
                –
                <button class="timestamp-btn" data-time="${parseTimestamp(request.timestampEnd)}">
                    ${_escapeHtml(request.timestampEnd)}
                </button>
            </span>
        </div>
        <p class="citation-description">${_escapeHtml(request.reason || '')}</p>
        <div class="citation-meta">
            ${_buildAuthorLink(request.username)}
            <span class="citation-date">${_formatDate(request.dateAdded)}</span>
        </div>
        <div class="citation-actions">
            <div class="vote-controls" data-request-id="${request.id}">
                <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                <span class="vote-score">${request.voteScore ?? 0}</span>
                <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
            </div>
            <div class="action-buttons">
                ${!canDelete ? `
                <button class="action-btn respond-btn"
                    data-start="${_escapeHtml(request.timestampStart)}"
                    data-end="${_escapeHtml(request.timestampEnd)}"
                    data-reason="${_escapeHtml(request.reason || '')}"
                    data-title="${_escapeHtml(request.title || '')}"
                    data-request-id="${_escapeHtml(request.id)}">
                    Respond
                </button>
                ` : ''}
                ${canDelete ? `<button class="action-btn delete-btn" data-id="${request.id}">Delete</button>` : ''}
                ${!canDelete ? `<button class="action-btn report-btn" data-id="${request.id}">Report</button>` : ''}
            </div>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    const vc = el.querySelector('.vote-controls');
    vc.querySelector('.upvote-btn').addEventListener('click',   () => handleVote(request.id, 'up',   'request'));
    vc.querySelector('.downvote-btn').addEventListener('click', () => handleVote(request.id, 'down', 'request'));

    if (!canDelete) {
        el.querySelector('.respond-btn')?.addEventListener('click', e => {
            const btn = e.currentTarget;
            respondWithCitation(
                btn.dataset.start,
                btn.dataset.end,
                `Response to request: ${btn.dataset.reason}`,
                btn.dataset.title,
                btn.dataset.requestId
            );
        });

        el.querySelector('.report-btn')?.addEventListener('click', () =>
            showReportDialog(request.id, 'request')
        );
    }

    if (canDelete) {
        el.querySelector('.delete-btn').addEventListener('click', async () => {
            if (!confirm('Delete this request?')) return;
            try {
                await apiDeleteRequest(request.id, getCurrentVideoId(), currentUsername);
                loadCitationRequests(1, true);
            } catch (err) {
                showToast('Failed to delete request. Please try again.', 'error');
            }
        });
    }

    return el;
}

async function updateRequestsList(requests, container, pagination = null, currentUsername = null) {
    if (!container) return;
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = '<p>No citation requests found for this video.</p>';
        return;
    }

    requests.forEach(r => {
        container.appendChild(createRequestElement(r, userVotes[r.id] || null, currentUsername));
    });

    if (pagination && pagination.page < pagination.pages) {
        const remaining = pagination.total - pagination.page * pagination.limit;
        const loadMore = document.createElement('button');
        loadMore.className   = 'cp-load-more-btn';
        loadMore.textContent = `Load more (${remaining} remaining)`;
        loadMore.addEventListener('click', () => loadCitationRequests(pagination.page + 1));
        container.appendChild(loadMore);
    }
}

async function updateCitationsList(citations, container) {
    if (!container) return;
    await _renderCitationsWithSections(citations, container);
}

// ── Polling ───────────────────────────────────

function startPolling() {
    if (_pollInterval) return;
    _pollInterval = setInterval(() => {
        const citContainer = document.getElementById('citations-container');
        const reqContainer = document.getElementById('citation-requests-container');
        if (citContainer?.style.display !== 'none') loadCitations(1, true);
        else if (reqContainer?.style.display !== 'none') loadCitationRequests(1, true);
    }, 15_000); // 15s — better collaborative responsiveness
}

function stopPolling() {
    clearInterval(_pollInterval);
    _pollInterval = null;
}

// ── Highlighting ──────────────────────────────

function updateHighlighting() {
    document.querySelectorAll('.citation-item').forEach(el => {
        const start = parseFloat(el.dataset.start);
        const end   = parseFloat(el.dataset.end);
        el.classList.toggle('active-citation', currentTime >= start && currentTime <= end);
    });
}

// ── In-memory sort & re-render (no network call) ──

const debouncedSortAndUpdate = debounce(async () => {
    const citContainer = document.getElementById('citations-container');
    const reqContainer = document.getElementById('citation-requests-container');

    if (citContainer?.style.display !== 'none' && currentCitations.length > 0) {
        await updateCitationsList(sortItems(currentCitations, currentSortOption, 'citation'), citContainer);
    }
    if (reqContainer?.style.display !== 'none' && currentRequests.length > 0) {
        await updateRequestsList(
            sortItems(currentRequests, currentSortOption, 'request'),
            reqContainer,
            null,
            _currentUsername
        );
    }
}, 60); // 60ms debounce — feels instant

// ── Private helpers ───────────────────────────

async function _appendCitationsPage(citations, container, pagination) {
    container.querySelector('.cp-load-more-btn')?.remove();

    const currentUsername = _currentUsername || await getCachedUsername();

    const groups     = new Map();
    const standalone = [];
    for (const c of citations) {
        if (c.requestId && _requestsById[c.requestId]) {
            if (!groups.has(c.requestId)) groups.set(c.requestId, []);
            groups.get(c.requestId).push(c);
        } else {
            standalone.push(c);
        }
    }

    const standaloneEls = await Promise.all(
        standalone.map(c => createCitationElement(c, userVotes[c.id] || null, currentUsername))
    );
    const groupEls = await Promise.all(
        [...groups.entries()].map(([requestId, responses]) =>
            createRequestResponseGroupElement(_requestsById[requestId], responses, userVotes, currentUsername)
        )
    );

    [...standaloneEls, ...groupEls].forEach(el => container.appendChild(el));

    if (pagination && pagination.page < pagination.pages) {
        const remaining = pagination.total - pagination.page * pagination.limit;
        const loadMore = document.createElement('button');
        loadMore.className   = 'cp-load-more-btn';
        loadMore.textContent = `Load more (${remaining} remaining)`;
        loadMore.addEventListener('click', () => loadCitations(pagination.page + 1));
        container.appendChild(loadMore);
    }

    requestAnimationFrame(updateHighlighting);
}

function _appendRequestsPage(requests, container, pagination, currentUsername = null) {
    container.querySelector('.cp-load-more-btn')?.remove();

    requests.forEach(r => {
        container.appendChild(createRequestElement(r, userVotes[r.id] || null, currentUsername));
    });

    if (pagination && pagination.page < pagination.pages) {
        const remaining = pagination.total - pagination.page * pagination.limit;
        const loadMore = document.createElement('button');
        loadMore.className   = 'cp-load-more-btn';
        loadMore.textContent = `Load more (${remaining} remaining)`;
        loadMore.addEventListener('click', () => loadCitationRequests(pagination.page + 1));
        container.appendChild(loadMore);
    }
}

function _showLoading(container) {
    container.innerHTML = `
        <div class="cp-loading">
            <div class="cp-skeleton"></div>
            <div class="cp-skeleton cp-skeleton--short"></div>
            <div class="cp-skeleton"></div>
        </div>
    `;
}

function _isSameList(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].voteScore !== b[i].voteScore) return false;
    }
    return true;
}

function _updateCounter(id, count) {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
}

function _formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/**
 * Build a safe YouTube author link.
 * Only renders an <a> if the username is a valid YouTube handle (@word chars).
 */
function _buildAuthorLink(username) {
    const display = _escapeHtml(username || 'Anonymous');
    if (username && /^@[\w.-]+$/.test(username)) {
        return `<a class="citation-author" href="https://www.youtube.com/${username}" target="_blank" rel="noopener noreferrer">${display}</a>`;
    }
    return `<span class="citation-author">${display}</span>`;
}

/**
 * Render a source URL as a clickable link only if the scheme is http/https.
 */
function _safeSourceLink(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return `<a class="citation-source" href="${_escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`;
    } catch {
        return '';
    }
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Show a brief toast notification.
 * Uses .cp-toast / .cp-toast-error / .cp-toast-success CSS classes.
 */
function showToast(message, type = 'info') {
    document.querySelector('.cp-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = `cp-toast cp-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 200);
        }, 3000);
    });
}
