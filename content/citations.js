// ─────────────────────────────────────────────
// citations.js
// Citation and Citation Request rendering,
// loading from Firebase, and list sorting.
// Depends on: api.js, utils.js, username.js, voting.js
// ─────────────────────────────────────────────

// ── Module state ──────────────────────────────

let currentCitations   = [];
let currentRequests    = [];
let userVotes          = {};
let currentSortOption  = 'upvotes';
let currentTime        = 0; // updated by player.js

// ── Load functions ────────────────────────────

async function loadCitations() {
    const container = document.getElementById('citations-container');
    if (!container) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    try {
        const [citations, votes] = await Promise.all([
            apiGetCitations(videoId),
            apiGetUserVotes(videoId, 'citation'),
        ]);

        userVotes = votes;

        // Cache username once per load and store it
        const username = await getYouTubeUsername();
        if (username) {
            chrome.storage.local.set({ youtubeUsername: username });
        }

        const sorted = sortItems(citations, currentSortOption, 'citation');

        if (container.style.display !== 'none' &&
            JSON.stringify(sorted) !== JSON.stringify(currentCitations)) {
            currentCitations = sorted;
            await _renderCitationsWithSections(sorted, container);
        }

        _updateCounter('citations-counter', citations.length);

    } catch (err) {
        console.error('[citations] Error loading citations:', err);
        if (container.style.display !== 'none') {
            container.innerHTML = `<p class="error-message">Error loading citations: ${err.message}</p>`;
        }
    }
}

async function loadCitationRequests() {
    const container = document.getElementById('citation-requests-container');
    if (!container) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    try {
        const [requests, votes] = await Promise.all([
            apiGetRequests(videoId),
            apiGetUserVotes(videoId, 'request'),
        ]);

        userVotes = votes;

        // Normalize dates and vote scores
        requests.forEach(r => {
            r.voteScore  = Number(r.voteScore ?? 0);
            r.dateAdded  = normalizeDateAdded(r.dateAdded);
        });

        const sorted = sortItems(requests, currentSortOption, 'request');

        if (container.style.display !== 'none' &&
            JSON.stringify(sorted) !== JSON.stringify(currentRequests)) {
            currentRequests = sorted;
            updateRequestsList(sorted, container);
        }

        _updateCounter('requests-counter', requests.length);

    } catch (err) {
        console.error('[citations] Error loading requests:', err);
        if (container.style.display !== 'none') {
            container.innerHTML = `<p class="error-message">Error loading requests: ${err.message}</p>`;
        }
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
 * Render citations split into "Current Timestamps" and "Other Citations" sections
 */
async function _renderCitationsWithSections(citations, container) {
    container.innerHTML = '';

    if (citations.length === 0) {
        container.innerHTML = '<p>No citations found for this video.</p>';
        return;
    }

    const elements = await Promise.all(
        citations.map(c => createCitationElement(c, userVotes[c.id] || null))
    );

    const highlighted = elements.filter(el =>
        parseFloat(el.dataset.start) <= currentTime && currentTime <= parseFloat(el.dataset.end)
    );
    const normal = elements.filter(el => !highlighted.includes(el));

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

    requestAnimationFrame(updateHighlighting);
}

/**
 * Build a single citation card element.
 * async because it needs chrome.storage for delete button visibility.
 * @param {Object} citation
 * @param {'up'|'down'|null} userVote
 * @returns {Promise<HTMLElement>}
 */
async function createCitationElement(citation, userVote) {
    const el = document.createElement('div');
    el.className      = 'citation-item';
    el.dataset.start  = parseTimestamp(citation.timestampStart);
    el.dataset.end    = parseTimestamp(citation.timestampEnd);

    const currentUsername = await getCachedUsername();
    const canDelete       = currentUsername && currentUsername === citation.username;

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
            <a class="citation-author" href="https://www.youtube.com/@${_escapeHtml(citation.username || 'Anonymous')}" target="_blank" rel="noopener noreferrer">@${_escapeHtml(citation.username || 'Anonymous')}</a>
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
            if (!confirm('Delete this citation?')) return;
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
            <a class="citation-author" href="https://www.youtube.com/@${_escapeHtml(request.username || 'Anonymous')}" target="_blank" rel="noopener noreferrer">@${_escapeHtml(request.username || 'Anonymous')}</a>
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
                    data-title="${_escapeHtml(request.title || '')}">
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
            btn.dataset.title
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
async function updateRequestsList(requests, container) {
    if (!container) return;
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = '<p>No citation requests found for this video.</p>';
        return;
    }

    requests.forEach(r => {
        container.appendChild(createRequestElement(r, userVotes[r.id] || null));
    });
}

/**
 * Re-render the citations list (used by updateCitationsList callers)
 */
async function updateCitationsList(citations, container) {
    if (!container) return;
    await _renderCitationsWithSections(citations, container);
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