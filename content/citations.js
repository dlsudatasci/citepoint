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

// ── Load functions ────────────────────────────

async function loadCitations(page = 1) {
    if (_citationsLoading) return;
    const container = document.getElementById('citations-container');
    if (!container) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    _citationsLoading = true;
    if (page === 1) {
        _showLoading(container);
        _updateCounter('citations-counter', '…');
    }

    try {
        const [{ citations, pagination }, votes] = await Promise.all([
            apiGetCitations(videoId, page),
            apiGetUserVotes(videoId, 'citation'),
        ]);

        userVotes = votes;

        // Cache username once per load
        const username = await getYouTubeUsername();
        if (username) {
            chrome.storage.local.set({ youtubeUsername: username });
        }

        const sorted = sortItems(citations, currentSortOption, 'citation');

        // Fetch requests for grouping response citations under their original request
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

async function loadCitationRequests(page = 1) {
    if (_requestsLoading) return;
    const container = document.getElementById('citation-requests-container');
    if (!container) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    _requestsLoading = true;
    if (page === 1) {
        _showLoading(container);
        _updateCounter('requests-counter', '…');
    }

    try {
        const [{ requests, pagination }, votes] = await Promise.all([
            apiGetRequests(videoId, page),
            apiGetUserVotes(videoId, 'request'),
        ]);

        userVotes = votes;

        // Normalize dates and vote scores
        requests.forEach(r => {
            r.voteScore  = Number(r.voteScore ?? 0);
            r.dateAdded  = normalizeDateAdded(r.dateAdded);
        });

        const sorted = sortItems(requests, currentSortOption, 'request');

        if (container.style.display !== 'none') {
            if (page === 1) {
                currentRequests = sorted;
                updateRequestsList(sorted, container, pagination);
            } else if (!_isSameList(sorted, currentRequests.slice(-sorted.length))) {
                currentRequests = [...currentRequests, ...sorted];
                _appendRequestsPage(sorted, container, pagination);
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
        // Fall through to recency for 'recent' sort or tiebreaking
        const dateA = new Date(a.dateAdded).getTime() || 0;
        const dateB = new Date(b.dateAdded).getTime() || 0;
        return dateB - dateA;
    };

    return [...highlighted.sort(sortFn), ...normal.sort(sortFn)];
}

// ── Rendering ─────────────────────────────────

/**
 * Render citations split into "Current Timestamps" and "Other Citations" sections.
 * Response citations that have a matching request in _requestsById are grouped
 * under a single composite card; the rest render individually.
 */
async function _renderCitationsWithSections(citations, container, pagination = null) {
    container.innerHTML = '';

    if (citations.length === 0) {
        container.innerHTML = '<p>No citations found for this video.</p>';
        return;
    }

    const currentUsername = await getCachedUsername();

    // Separate into request-response groups and standalone citations
    const groups    = new Map(); // requestId → citation[]
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

/**
 * Build a single citation card element.
 * async because it needs chrome.storage for delete button visibility.
 * @param {Object} citation
 * @param {'up'|'down'|null} userVote
 * @returns {Promise<HTMLElement>}
 */
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
            <a class="citation-author" href="https://www.youtube.com/${_escapeHtml(citation.username || 'Anonymous')}" target="_blank" rel="noopener noreferrer">${_escapeHtml(citation.username || 'Anonymous')}</a>
            <span class="citation-date"> · ${_formatDate(citation.dateAdded)}</span>
        </div>
        ${isResponse ? '<span class="response-badge">Response</span>' : ''}
        <p class="citation-description">${_escapeHtml(displayDescription || '')}</p>
        ${citation.source ? `<p class="citation-source-url">${_escapeHtml(citation.source)}</p>` : ''}
        <div class="citation-actions">
            <div class="vote-controls" data-citation-id="${citation.id}">
                <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                <span class="vote-score">${citation.voteScore ?? 0}</span>
                <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
            </div>
            <div class="action-buttons">
                ${canDelete ? `<button class="action-btn delete-btn" data-id="${citation.id}">Delete</button>` : ''}
                <button class="action-btn report-btn" data-id="${citation.id}">Report</button>
            </div>
        </div>
    `;

    // ── Event listeners ───────────────────────

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
            const confirmed = await showConfirm('Delete this citation?');
            if (!confirmed) return;
            
            try {
                await apiDeleteCitation(citation.id, getCurrentVideoId());
                loadCitations();
            } catch (err) {
                showToast('Failed to delete citation. Please try again.', 'error');
            }
        });
    }

    el.querySelector('.report-btn').addEventListener('click', () =>
        showReportDialog(citation.id, 'citation')
    );

    return el;
}

/**
 * Build a grouped card showing the original request header and all its response
 * citations beneath it — one container for all responses to a single request.
 */
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
            ${citation.source ? `<a class="citation-source" href="${_escapeHtml(citation.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
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
                    <button class="action-btn report-btn" data-id="${citation.id}">Report</button>
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
                const confirmed = await showConfirm('Delete this citation?');
                if (!confirmed) return;
                
                try {
                    await apiDeleteCitation(citation.id, getCurrentVideoId());
                    loadCitations();
                } catch (err) {
                    showToast('Failed to delete citation. Please try again.', 'error');
                }
            });
        }

        responseEl.querySelector('.report-btn').addEventListener('click', () =>
            showReportDialog(citation.id, 'citation')
        );

        responsesContainer.appendChild(responseEl);
    }

    return el;
}

/**
 * Build a single citation request card element.
 */
function createRequestElement(request, userVote) {
    const el = document.createElement('div');
    el.className = 'citation-item request-item';
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
        <p class="citation-description">${_escapeHtml(request.reason || '')}</p>
        <div class="citation-meta">
            <a class="citation-author" href="https://www.youtube.com/${_escapeHtml(request.username || 'Anonymous')}" target="_blank" rel="noopener noreferrer">${_escapeHtml(request.username || 'Anonymous')}</a>
            <span class="citation-date">${_formatDate(request.dateAdded)}</span>
        </div>
        <div class="citation-actions">
            <div class="vote-controls" data-request-id="${request.id}">
                <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                <span class="vote-score">${request.voteScore ?? 0}</span>
                <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
            </div>
            <div class="action-buttons">
                <button class="action-btn respond-btn"
                    data-start="${_escapeHtml(request.timestampStart)}"
                    data-end="${_escapeHtml(request.timestampEnd)}"
                    data-reason="${_escapeHtml(request.reason || '')}"
                    data-title="${_escapeHtml(request.title || '')}"
                    data-request-id="${_escapeHtml(request.id)}">
                    Respond
                </button>
                <button class="action-btn report-btn" data-id="${request.id}">Report</button>
            </div>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    const vc = el.querySelector('.vote-controls');
    vc.querySelector('.upvote-btn').addEventListener('click',   () => handleVote(request.id, 'up',   'request'));
    vc.querySelector('.downvote-btn').addEventListener('click', () => handleVote(request.id, 'down', 'request'));

    el.querySelector('.respond-btn').addEventListener('click', e => {
        const btn = e.currentTarget;
        respondWithCitation(
            btn.dataset.start,
            btn.dataset.end,
            `Response to request: ${btn.dataset.reason}`,
            btn.dataset.title,
            btn.dataset.requestId
        );
    });

    el.querySelector('.report-btn').addEventListener('click', () =>
        showReportDialog(request.id, 'request')
    );

    return el;
}

/**
 * Re-render the requests list
 */
async function updateRequestsList(requests, container, pagination = null) {
    if (!container) return;
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = '<p>No citation requests found for this video.</p>';
        return;
    }

    requests.forEach(r => {
        container.appendChild(createRequestElement(r, userVotes[r.id] || null));
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

/**
 * Re-render the citations list (used by updateCitationsList callers)
 */
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
        if (citContainer?.style.display !== 'none') loadCitations();
        else if (reqContainer?.style.display !== 'none') loadCitationRequests();
    }, 30_000);
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

// ── Debounced re-sort ─────────────────────────

const debouncedSortAndUpdate = debounce(() => {
    const citContainer = document.getElementById('citations-container');
    const reqContainer = document.getElementById('citation-requests-container');

    if (citContainer?.style.display !== 'none') {
        updateCitationsList(sortItems(currentCitations, currentSortOption, 'citation'), citContainer);
    }
    if (reqContainer?.style.display !== 'none') {
        updateRequestsList(sortItems(currentRequests, currentSortOption, 'request'), reqContainer);
    }
}, 250);

// ── Private helpers ───────────────────────────

async function _appendCitationsPage(citations, container, pagination) {
    container.querySelector('.cp-load-more-btn')?.remove();

    const currentUsername = await getCachedUsername();

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

function _appendRequestsPage(requests, container, pagination) {
    container.querySelector('.cp-load-more-btn')?.remove();

    requests.forEach(r => {
        container.appendChild(createRequestElement(r, userVotes[r.id] || null));
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
 * Escape HTML special characters to prevent XSS.
 * All user-generated content must pass through this before being
 * placed in innerHTML.
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