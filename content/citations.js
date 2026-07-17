// ─────────────────────────────────────────────
// citations.js
// Citation and Citation Request rendering,
// loading from the Express backend, and list sorting.
// Depends on: api.js, utils.js, username.js, voting.js
// ─────────────────────────────────────────────

function _isContextInvalidated() {
    return !chrome.runtime?.id;
}

// ── Module state ──────────────────────────────

let currentCitations   = [];
let currentRequests    = [];
let userVotes          = {};
let currentSortOption  = 'upvotes';
let currentTime        = 0; // updated by player.js

let _citationsLoading  = false;
let _requestsLoading   = false;
let _requestsById      = {}; // request objects keyed by id, for grouping response citations
let _currentUsername   = null; // cached once per load so re-renders don't need to re-fetch

function _isOwner(currentUsername, itemUsername) {
    if (!currentUsername || !itemUsername) return false;
    const normalize = s => s.replace(/^@/, '').toLowerCase();
    return normalize(currentUsername) === normalize(itemUsername);
}

const MAX_INLINE_RESPONSES = 3;

function _rankResponses(responses) {
    return [...responses].sort((a, b) => {
        const aExpert = a.categoryVerified ? 1 : 0;
        const bExpert = b.categoryVerified ? 1 : 0;
        if (bExpert !== aExpert) return bExpert - aExpert;
        if ((b.voteScore ?? 0) !== (a.voteScore ?? 0)) return (b.voteScore ?? 0) - (a.voteScore ?? 0);
        return new Date(b.dateAdded) - new Date(a.dateAdded);
    });
}

// ── Vote-load optimisation (#5) ───────────────
// Votes are stored in chrome.storage.local and updated optimistically on every
// vote action.  Re-reading storage on every 15-s poll is redundant — we only
// need a fresh read when we switch to a new video.
let _votesLoaded       = false;
let _votesVideoId      = null; // videoId for which votes were last loaded

// ── Reported-items cache (#10) ────────────────
// Loaded once per video session; updated after each successful report submission.
let _reportedItems     = {}; // itemId → true

// ── Categories / expert state ─────────────────
let _isExpertUser      = null;  // cached result of apiCheckExpert, null = not yet checked
let _currentCategoryFilter = ''; // '' = all categories

// CATEGORY_COLORS is a global from config/config.js (loaded before this file).

/**
 * Check (once, cached) whether the current user is a recognized expert.
 */
async function _ensureExpertChecked(username) {
    if (_isExpertUser !== null) return _isExpertUser;
    if (!username) { _isExpertUser = false; return false; }
    try {
        _isExpertUser = await apiCheckExpert(username);
    } catch (_) {
        _isExpertUser = false;
    }
    return _isExpertUser;
}

/**
 * Render a category badge, with a checkmark if expert-verified.
 */
function _buildCategoryBadge(category, categoryVerified) {
    const cat = category || DEFAULT_CATEGORY;
    const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS[DEFAULT_CATEGORY];
    const verifiedMark = categoryVerified
        ? ' <span class="category-verified" title="Verified by an expert">✓</span>'
        : '';
    return `<span class="category-badge" style="background-color:${colors.bg};color:${colors.color}">${_escapeHtml(cat)}${verifiedMark}</span>`;
}

/**
 * Render a <select> for changing/suggesting an item's category.
 * Experts can change any category (and verify it); non-experts can only
 * suggest a category for items that aren't yet expert-verified.
 */
function _buildCategorySelect(item) {
    const current = item.category || DEFAULT_CATEGORY;
    const options = CATEGORIES.map(c =>
        `<option value="${_escapeHtml(c)}" ${c === current ? 'selected' : ''}>${_escapeHtml(c)}</option>`
    ).join('');
    const label = _isExpertUser ? 'Set category' : 'Suggest category';
    return `
        <label class="category-select-label" title="${label}">
            <select class="category-select">${options}</select>
        </label>
    `;
}

/**
 * Decide whether to show a category-edit control for this item, and wire it up.
 */
function _wireCategoryControls(el, item, itemType) {
    const select = el.querySelector('.category-select');
    if (!select) return;

    select.addEventListener('change', async () => {
        const newCategory = select.value;
        const previous    = item.category;
        select.disabled = true;
        try {
            const username = _currentUsername || await getCachedUsername();
            if (!username) throw new Error('You must be logged in to set a category.');

            const result = await apiUpdateCategory(item.id, itemType, getCurrentVideoId(), newCategory, username);
            item.category         = result.category;
            item.categoryVerified = result.categoryVerified;

            const badge = el.querySelector('.category-badge');
            if (badge) badge.outerHTML = _buildCategoryBadge(item.category, item.categoryVerified);

            showToast(item.categoryVerified ? 'Category verified.' : 'Category suggestion saved.', 'success');
        } catch (err) {
            select.value = previous || DEFAULT_CATEGORY;
            showToast(err.message || 'Failed to update category.', 'error');
        } finally {
            select.disabled = false;
        }
    });
}

// ── Polling / SSE state ───────────────────────

// _pollTimeout replaces the old _pollInterval setInterval ID.
// We use setTimeout + self-rescheduling so the interval can adapt dynamically
// (fast when idle-timeout hasn't triggered, slow when SSE is active or user is idle).
let _pollTimeout        = null;
let _pollingActive      = false; // true between startPolling() and stopPolling()

// Idle tracking (#8) — interaction resets the timer; after _IDLE_THRESHOLD_MS
// without interaction the poll slows to _POLL_SLOW_MS.
let _lastInteractionTime   = Date.now();
let _idleTrackingInstalled = false;
const _IDLE_THRESHOLD_MS   = 2 * 60 * 1000; // 2 minutes
const _POLL_FAST_MS        = 15_000;         // normal interval
const _POLL_SLOW_MS        = 60_000;         // idle / SSE-active interval

// SSE state (#2)
let _sseSource       = null;  // EventSource instance
let _sseVideoId      = null;  // videoId the current connection watches
let _sseRetryTimeout = null;  // reconnect backoff timer
let _sseRetryDelay   = 1_000; // current backoff delay (ms)
let _sseFailCount    = 0;     // consecutive connection failures
const _SSE_MAX_FAIL  = 5;     // give up and fall back to normal polling after N failures
const _SSE_MAX_DELAY = 30_000; // cap for exponential backoff

// ── Load functions ────────────────────────────

/**
 * @param {number}  page
 * @param {boolean} silent  When true, existing content stays visible during refetch (no skeleton flash).
 *                          Use for post-submit refreshes and tab switches when data is already loaded.
 */
async function loadCitations(page = 1, silent = false) {
    if (_isContextInvalidated()) return;
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
        const counterEl = document.getElementById('citations-counter');
        if (!counterEl || counterEl.textContent === '0') {
            _updateCounter('citations-counter', '…');
        }
    }

    try {
        // ── Fix #5: skip vote re-read when already loaded for this video ──
        // Votes are updated optimistically in handleVote (voting.js) and
        // written to chrome.storage.local by background.js.  Re-reading on
        // every poll tick is safe but wasteful; the in-memory userVotes map
        // is already authoritative after the first load.
        let votesPromise;
        if (!_votesLoaded || _votesVideoId !== videoId) {
            votesPromise = apiGetUserVotes(videoId, 'citation');
        } else {
            votesPromise = Promise.resolve({});
        }

        const [{ citations, pagination }, freshVotes] = await Promise.all([
            apiGetCitations(videoId, page),
            votesPromise,
        ]);

        if (!_votesLoaded || _votesVideoId !== videoId) {
            // First load for this video — replace stale votes entirely
            userVotes = { ...freshVotes };
            _votesLoaded  = true;
            _votesVideoId = videoId;
        } else {
            // Subsequent polls — merge to preserve any in-flight optimistic updates
            userVotes = { ...userVotes, ...freshVotes };
        }

        citations.forEach(c => {
            c.voteScore = Number(c.voteScore ?? 0);
            c.dateAdded = normalizeDateAdded(c.dateAdded);
        });

        const username = await getYouTubeUsername();
        if (username) {
            // Use chrome.storage.local if available, fallback to localStorage
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ youtubeUsername: username });
                } else {
                    localStorage.setItem('youtubeUsername', username);
                }
            } catch (_) {}
            _currentUsername = username;
        } else {
            _currentUsername = await getCachedUsername();
        }
        await _ensureExpertChecked(_currentUsername);

        const sorted = sortItems(citations, currentSortOption, 'citation');

        // ── Fix #1: targeted request fetch instead of blanket 200-item pull ──
        // Only fetch requests if any citation references one (hasResponses),
        // and only fetch the specific IDs we need — not the entire collection.
        if (page === 1) {
            const requestIds = [
                ...new Set(
                    sorted.filter(c => c.requestId).map(c => c.requestId)
                )
            ];

            if (requestIds.length > 0) {
                try {
                    const { requests } = await apiGetRequestsByIds(videoId, requestIds);
                    _requestsById = Object.fromEntries(
                        requests.map(r => [r.id || r._id, r])
                    );
                } catch (e) {
                    // Non-fatal — citations without matching requests render as standalone
                    console.warn('[citations] Could not fetch parent requests for grouping:', e);
                    _requestsById = {};
                }
            } else {
                _requestsById = {};
            }
        }

        // ── Load reported items once per video for button state (#10) ─────
        if (page === 1 && _votesVideoId === videoId) {
            const reportedKey = `reported_items_${videoId}`;
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    const storedData = await new Promise(r => chrome.storage.local.get(reportedKey, r));
                    _reportedItems = storedData[reportedKey] || {};
                } else {
                    const stored = localStorage.getItem(reportedKey);
                    _reportedItems = stored ? JSON.parse(stored) : {};
                }
            } catch (_) {
                _reportedItems = {};
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
            _applyCategoryFilter();
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
    if (_isContextInvalidated()) return;
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
        // ── Fix #5: skip vote re-read when already loaded for this video ──
        let votesPromise;
        if (!_votesLoaded || _votesVideoId !== videoId) {
            votesPromise = apiGetUserVotes(videoId, 'request');
        } else {
            votesPromise = Promise.resolve({});
        }

        const [{ requests, pagination }, freshVotes] = await Promise.all([
            apiGetRequests(videoId, page),
            votesPromise,
        ]);

        // Merge to preserve optimistic vote state
        userVotes = { ...userVotes, ...freshVotes };

        requests.forEach(r => {
            r.voteScore  = Number(r.voteScore ?? 0);
            r.dateAdded  = normalizeDateAdded(r.dateAdded);
        });

        _currentUsername = _currentUsername || await getCachedUsername();
        await _ensureExpertChecked(_currentUsername);

        const sorted = sortItems(requests, currentSortOption, 'request');

        if (container.style.display !== 'none') {
            if (page === 1) {
                currentRequests = sorted;
                await updateRequestsList(sorted, container, pagination, _currentUsername);
            } else if (!_isSameList(sorted, currentRequests.slice(-sorted.length))) {
                currentRequests = [...currentRequests, ...sorted];
                await _appendRequestsPage(sorted, container, pagination, _currentUsername);
            }
            _applyCategoryFilter();
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

    const requestGroups  = new Map();
    const replyGroups    = new Map();
    const standalone     = [];
    const parentIds      = new Set();

    for (const c of citations) {
        if (c.requestId && _requestsById[c.requestId]) {
            if (!requestGroups.has(c.requestId)) requestGroups.set(c.requestId, []);
            requestGroups.get(c.requestId).push(c);
        } else if (c.parentCitationId) {
            if (!replyGroups.has(c.parentCitationId)) replyGroups.set(c.parentCitationId, []);
            replyGroups.get(c.parentCitationId).push(c);
            parentIds.add(c.parentCitationId);
        } else {
            standalone.push(c);
        }
    }

    const parentsInList = new Map();
    const trueStandalone = [];
    for (const c of standalone) {
        if (parentIds.has(c.id)) {
            parentsInList.set(c.id, c);
        } else if (replyGroups.has(c.id)) {
            parentsInList.set(c.id, c);
        } else {
            trueStandalone.push(c);
        }
    }

    const standaloneEls = await Promise.all(
        trueStandalone.map(c => createCitationElement(c, userVotes[c.id] || null, currentUsername))
    );
    const requestGroupEls = await Promise.all(
        [...requestGroups.entries()].map(([requestId, responses]) =>
            createRequestResponseGroupElement(_requestsById[requestId], responses, userVotes, currentUsername)
        )
    );
    const replyGroupEls = await Promise.all(
        [...replyGroups.entries()].map(([parentId, replies]) => {
            const parent = parentsInList.get(parentId);
            if (!parent) {
                return Promise.all(replies.map(c => createCitationElement(c, userVotes[c.id] || null, currentUsername)));
            }
            return createCitationReplyGroupElement(parent, replies, userVotes, currentUsername);
        })
    );

    const flatReplyEls = replyGroupEls.flat();
    const allElements = [...standaloneEls, ...requestGroupEls, ...flatReplyEls];

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
        loadMore.className   = 'cp-load-more-btn cp-btn cp-btn--secondary';
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
    el.dataset.category = citation.category || DEFAULT_CATEGORY;

    const canDelete = _isOwner(currentUsername, citation.username);
    const showCategorySelect = canDelete || _isExpertUser || !citation.categoryVerified;

    // Use requestId field for response detection — more reliable than description prefix
    const isResponse       = !!citation.requestId;
    const displayDescription = isResponse && citation.description?.startsWith('Response to request:')
        ? citation.description.split('\n\n').slice(1).join('\n\n').trim()
        : citation.description;

    const authorLink = _buildAuthorLink(citation.username);

    // Disable the Report button if this item was already reported (#10)
    const alreadyReported = !!_reportedItems[citation.id];

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
        <div class="category-row">
            ${_buildCategoryBadge(citation.category, citation.categoryVerified)}
            ${showCategorySelect ? _buildCategorySelect(citation) : ''}
        </div>
        ${isResponse ? '<span class="response-badge">Response</span>' : ''}
        ${_buildDescription(displayDescription)}
        <div class="citation-actions">
            ${_safeSourceLink(citation.source)}
            <div class="citation-actions-right">
                <div class="vote-controls" data-citation-id="${citation.id}">
                    <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                    <span class="vote-score">${citation.voteScore ?? 0}</span>
                    <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
                </div>
                <div class="action-buttons">
                    ${!canDelete ? `
                    <button class="action-btn respond-btn reply-btn"
                        data-start="${_escapeHtml(citation.timestampStart)}"
                        data-end="${_escapeHtml(citation.timestampEnd)}"
                        data-description="${_escapeHtml(citation.description || '')}"
                        data-title="${_escapeHtml(citation.citationTitle || '')}"
                        data-parent-citation-id="${citation.id}">
                        Reply
                    </button>` : ''}
                    ${canDelete ? `<button class="action-btn delete-btn" data-id="${citation.id}">Delete</button>` : ''}
                    ${!canDelete ? `<button class="action-btn report-btn" data-id="${citation.id}" ${alreadyReported ? 'disabled title="Already reported"' : ''}>Report</button>` : ''}
                </div>
            </div>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    // ── Description expand/collapse (#7) ──────
    el.querySelector('.cp-desc-toggle')?.addEventListener('click', function () {
        const p    = this.closest('.citation-description');
        p.querySelector('.cp-desc-full').style.display  = 'inline';
        p.querySelector('.cp-desc-dots').style.display  = 'none';
        this.style.display = 'none';
    });

    const voteControls = el.querySelector('.vote-controls');
    voteControls.querySelector('.upvote-btn').addEventListener('click', () =>
        handleVote(citation.id, 'up', 'citation')
    );
    voteControls.querySelector('.downvote-btn').addEventListener('click', () =>
        handleVote(citation.id, 'down', 'citation')
    );

    _wireCategoryControls(el, citation, 'citation');

    if (canDelete) {
        el.querySelector('.delete-btn').addEventListener('click', async () => {
            const confirmed = await showConfirm('Delete this citation?');
            if (!confirmed) return;

            // Optimistic: remove from DOM and memory immediately
            el.remove();
            currentCitations = currentCitations.filter(c => c.id !== citation.id);
            try {
                await apiDeleteCitation(citation.id, getCurrentVideoId(), currentUsername);
                // Success — DOM already updated, no reload needed
            } catch (err) {
                showToast('Failed to delete citation. Please try again.', 'error');
                // Restore list on failure
                _votesLoaded = false;
                _votesVideoId = null;
                _citationsLoading = false;
                loadCitations(1, false);
            }
        });
    }

    if (!canDelete) {
        el.querySelector('.reply-btn')?.addEventListener('click', e => {
            const btn = e.currentTarget;
            respondWithCitation(
                btn.dataset.start,
                btn.dataset.end,
                `Response to request: ${btn.dataset.description}`,
                btn.dataset.title,
                null,
                btn.dataset.parentCitationId
            );
        });

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
    el.dataset.category = request.category || DEFAULT_CATEGORY;

    const isRequestOwner = _isOwner(currentUsername, request.username);
    const showRequestCategorySelect = isRequestOwner || _isExpertUser || !request.categoryVerified;

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
        <div class="category-row">
            ${_buildCategoryBadge(request.category, request.categoryVerified)}
            ${showRequestCategorySelect ? _buildCategorySelect(request) : ''}
        </div>
        <div class="rg-divider"></div>
        <div class="rg-responses">
            <span class="rg-responses-label">${responseCitations.length} Response${responseCitations.length !== 1 ? 's' : ''}</span>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    _wireCategoryControls(el, request, 'request');

    const responsesContainer = el.querySelector('.rg-responses');

    const ranked = _rankResponses(responseCitations);
    const shown  = ranked.slice(0, MAX_INLINE_RESPONSES);
    const hidden = ranked.length - shown.length;

    for (const citation of shown) {
        const responseEl = await _buildResponseEntry(citation, votes, currentUsername);
        responsesContainer.appendChild(responseEl);
    }

    const discussionLink = document.createElement('a');
    discussionLink.className   = 'rg-see-all-link';
    discussionLink.href        = '#';
    discussionLink.textContent = hidden > 0
        ? `View all ${responseCitations.length} responses`
        : `View discussion`;
    discussionLink.addEventListener('click', e => {
        e.preventDefault();
        const url = chrome.runtime.getURL(`dashboard/dashboard.html?view=discussion&type=request&id=${request.id || request._id}`);
        window.open(url, '_blank');
    });
    responsesContainer.appendChild(discussionLink);

    return el;
}

async function createCitationReplyGroupElement(parentCitation, replies, votes, currentUsername) {
    const el = document.createElement('div');
    el.className     = 'citation-item citation-reply-group';
    el.dataset.start = parseTimestamp(parentCitation.timestampStart);
    el.dataset.end   = parseTimestamp(parentCitation.timestampEnd);
    el.dataset.category = parentCitation.category || DEFAULT_CATEGORY;

    const canDeleteParent = _isOwner(currentUsername, parentCitation.username);
    const parentVote      = votes[parentCitation.id] || null;
    const alreadyReportedParent = !!_reportedItems[parentCitation.id];
    const showParentCategorySelect = canDeleteParent || _isExpertUser || !parentCitation.categoryVerified;

    el.innerHTML = `
        <div class="citation-header">
            <span class="citation-title">${_escapeHtml(parentCitation.citationTitle || 'Untitled')}</span>
        </div>
        <div class="citation-timestamp">
            <button class="timestamp-btn" data-time="${parseTimestamp(parentCitation.timestampStart)}">
                ${_escapeHtml(parentCitation.timestampStart)}
            </button>
            to
            <button class="timestamp-btn" data-time="${parseTimestamp(parentCitation.timestampEnd)}">
                ${_escapeHtml(parentCitation.timestampEnd)}
            </button>
        </div>
        <div class="citation-meta">
            ${_buildAuthorLink(parentCitation.username)}
            <span class="citation-date"> · ${_formatDate(parentCitation.dateAdded)}</span>
        </div>
        <div class="category-row">
            ${_buildCategoryBadge(parentCitation.category, parentCitation.categoryVerified)}
            ${showParentCategorySelect ? _buildCategorySelect(parentCitation) : ''}
        </div>
        ${_buildDescription(parentCitation.description)}
        <div class="citation-actions">
            ${_safeSourceLink(parentCitation.source)}
            <div class="citation-actions-right">
                <div class="vote-controls" data-citation-id="${parentCitation.id}">
                    <button class="vote-btn upvote-btn ${parentVote === 'up' ? 'voted' : ''}" title="${parentVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                    <span class="vote-score">${parentCitation.voteScore ?? 0}</span>
                    <button class="vote-btn downvote-btn ${parentVote === 'down' ? 'voted' : ''}" title="${parentVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
                </div>
                <div class="action-buttons">
                    ${!canDeleteParent ? `
                    <button class="action-btn respond-btn reply-btn"
                        data-start="${_escapeHtml(parentCitation.timestampStart)}"
                        data-end="${_escapeHtml(parentCitation.timestampEnd)}"
                        data-description="${_escapeHtml(parentCitation.description || '')}"
                        data-title="${_escapeHtml(parentCitation.citationTitle || '')}"
                        data-parent-citation-id="${parentCitation.id}">
                        Reply
                    </button>` : ''}
                    ${canDeleteParent ? `<button class="action-btn delete-btn" data-id="${parentCitation.id}">Delete</button>` : ''}
                    ${!canDeleteParent ? `<button class="action-btn report-btn" data-id="${parentCitation.id}" ${alreadyReportedParent ? 'disabled title="Already reported"' : ''}>Report</button>` : ''}
                </div>
            </div>
        </div>
        <div class="rg-divider"></div>
        <div class="rg-responses">
            <span class="rg-responses-label">${replies.length} Repl${replies.length !== 1 ? 'ies' : 'y'}</span>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    el.querySelector('.cp-desc-toggle')?.addEventListener('click', function () {
        const p = this.closest('.citation-description');
        p.querySelector('.cp-desc-full').style.display = 'inline';
        p.querySelector('.cp-desc-dots').style.display = 'none';
        this.style.display = 'none';
    });

    const parentVc = el.querySelector('.vote-controls');
    parentVc.querySelector('.upvote-btn').addEventListener('click', () =>
        handleVote(parentCitation.id, 'up', 'citation')
    );
    parentVc.querySelector('.downvote-btn').addEventListener('click', () =>
        handleVote(parentCitation.id, 'down', 'citation')
    );

    _wireCategoryControls(el, parentCitation, 'citation');

    if (canDeleteParent) {
        el.querySelector('.delete-btn').addEventListener('click', async () => {
            const confirmed = await showConfirm('Delete this citation?');
            if (!confirmed) return;
            el.remove();
            currentCitations = currentCitations.filter(c => c.id !== parentCitation.id);
            try {
                await apiDeleteCitation(parentCitation.id, getCurrentVideoId(), currentUsername);
            } catch (err) {
                showToast('Failed to delete citation. Please try again.', 'error');
                _votesLoaded = false;
                _votesVideoId = null;
                _citationsLoading = false;
                loadCitations(1, false);
            }
        });
    }

    if (!canDeleteParent) {
        el.querySelector('.reply-btn')?.addEventListener('click', e => {
            const btn = e.currentTarget;
            respondWithCitation(
                btn.dataset.start, btn.dataset.end,
                `Response to request: ${btn.dataset.description}`,
                btn.dataset.title, null, btn.dataset.parentCitationId
            );
        });
        el.querySelector('.report-btn')?.addEventListener('click', () =>
            showReportDialog(parentCitation.id, 'citation')
        );
    }

    const responsesContainer = el.querySelector('.rg-responses');

    const rankedReplies = _rankResponses(replies);
    const shownReplies  = rankedReplies.slice(0, MAX_INLINE_RESPONSES);
    const hiddenReplies = rankedReplies.length - shownReplies.length;

    for (const citation of shownReplies) {
        const replyEl = await _buildResponseEntry(citation, votes, currentUsername);
        responsesContainer.appendChild(replyEl);
    }

    const discussionLink = document.createElement('a');
    discussionLink.className   = 'rg-see-all-link';
    discussionLink.href        = '#';
    discussionLink.textContent = hiddenReplies > 0
        ? `View all ${replies.length} replies`
        : `View discussion`;
    discussionLink.addEventListener('click', e => {
        e.preventDefault();
        const url = chrome.runtime.getURL(`dashboard/dashboard.html?view=discussion&type=citation&id=${parentCitation.id || parentCitation._id}`);
        window.open(url, '_blank');
    });
    responsesContainer.appendChild(discussionLink);

    return el;
}

function createRequestElement(request, userVote, currentUsername = null) {
    const el = document.createElement('div');
    el.className = 'citation-item request-item';
    el.dataset.start = parseTimestamp(request.timestampStart);
    el.dataset.end   = parseTimestamp(request.timestampEnd);
    el.dataset.category = request.category || DEFAULT_CATEGORY;

    const canDelete       = _isOwner(currentUsername, request.username);
    const alreadyReported = !!_reportedItems[request.id];
    const showCategorySelect = canDelete || _isExpertUser || !request.categoryVerified;

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
        ${_buildDescription(request.reason)}
        <div class="citation-meta">
            ${_buildAuthorLink(request.username)}
            <span class="citation-date">${_formatDate(request.dateAdded)}</span>
        </div>
        <div class="category-row">
            ${_buildCategoryBadge(request.category, request.categoryVerified)}
            ${showCategorySelect ? _buildCategorySelect(request) : ''}
        </div>
        <div class="citation-actions">
            <div class="citation-actions-right">
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
                    ${!canDelete ? `<button class="action-btn report-btn" data-id="${request.id}" ${alreadyReported ? 'disabled title="Already reported"' : ''}>Report</button>` : ''}
                </div>
            </div>
        </div>
    `;

    el.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => seekToTime(parseFloat(btn.dataset.time)));
    });

    el.querySelector('.cp-desc-toggle')?.addEventListener('click', function () {
        const p = this.closest('.citation-description');
        p.querySelector('.cp-desc-full').style.display = 'inline';
        p.querySelector('.cp-desc-dots').style.display = 'none';
        this.style.display = 'none';
    });

    const vc = el.querySelector('.vote-controls');
    vc.querySelector('.upvote-btn').addEventListener('click',   () => handleVote(request.id, 'up',   'request'));
    vc.querySelector('.downvote-btn').addEventListener('click', () => handleVote(request.id, 'down', 'request'));

    _wireCategoryControls(el, request, 'request');

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
        loadMore.className   = 'cp-load-more-btn cp-btn cp-btn--secondary';
        loadMore.textContent = `Load more (${remaining} remaining)`;
        loadMore.addEventListener('click', () => loadCitationRequests(pagination.page + 1));
        container.appendChild(loadMore);
    }
}

async function updateCitationsList(citations, container) {
    if (!container) return;
    await _renderCitationsWithSections(citations, container);
}

// ── SSE (#2) ──────────────────────────────────

/**
 * Start an SSE connection for a videoId.
 * If one already exists for this video, this is a no-op.
 * Falls back to polling-only after _SSE_MAX_FAIL consecutive failures.
 */
function _connectSSE(videoId) {
    if (_isContextInvalidated()) return;
    // Cancel any pending reconnect timer before starting fresh
    if (_sseRetryTimeout) { clearTimeout(_sseRetryTimeout); _sseRetryTimeout = null; }

    // Already connected to this video
    if (_sseSource && _sseVideoId === videoId && _sseSource.readyState !== EventSource.CLOSED) return;

    // Clean up stale connection to a different video
    if (_sseSource) {
        _sseSource.close();
        _sseSource = null;
    }

    _sseVideoId = videoId;

    try {
        _sseSource = new EventSource(apiGetSSEUrl(videoId));
    } catch (err) {
        // EventSource constructor can throw if URL is malformed or feature unavailable
        console.warn('[sse] Could not create EventSource, polling only:', err);
        _sseSource = null;
        return;
    }

    _sseSource.onopen = () => {
        console.log('[sse] Connected for video:', videoId);
        _sseRetryDelay = 1_000; // reset backoff on success
        _sseFailCount  = 0;
    };

    _sseSource.onmessage = (e) => {
        if (!e.data || e.data.trim() === '') return;
        try {
            const event = JSON.parse(e.data);
            _handleSSEEvent(event);
        } catch (err) {
            console.warn('[sse] Failed to parse event data:', e.data, err);
        }
    };

    _sseSource.onerror = () => {
        // EventSource fires onerror on any connection problem and then tries
        // to reconnect automatically using its own retry mechanism.  We close
        // it explicitly and apply our own exponential backoff so we can give
        // up after _SSE_MAX_FAIL attempts and revert to normal polling.
        if (_sseSource) { _sseSource.close(); _sseSource = null; }

        _sseFailCount++;

        if (_sseFailCount >= _SSE_MAX_FAIL) {
            console.warn(`[sse] ${_sseFailCount} consecutive failures — SSE disabled, polling only`);
            _sseVideoId    = null;
            _sseFailCount  = 0;
            _sseRetryDelay = 1_000;
            // Polling continues at the existing rate (_schedulePoll already running)
            return;
        }

        // Exponential backoff: 1 s → 2 → 4 → 8 → 16 → 30 (capped)
        const delay       = _sseRetryDelay;
        _sseRetryDelay    = Math.min(_sseRetryDelay * 2, _SSE_MAX_DELAY);
        console.log(`[sse] Reconnecting in ${delay}ms (attempt ${_sseFailCount}/${_SSE_MAX_FAIL})`);
        _sseRetryTimeout  = setTimeout(() => _connectSSE(videoId), delay);
    };
}

function stopSSE() {
    if (_sseRetryTimeout) { clearTimeout(_sseRetryTimeout); _sseRetryTimeout = null; }
    if (_sseSource)       { _sseSource.close(); _sseSource = null; }
    _sseVideoId    = null;
    _sseFailCount  = 0;
    _sseRetryDelay = 1_000;
}

/**
 * Process an incoming SSE event.  Vote-changed events are applied in-place
 * (no reload); add/delete events trigger a silent full refresh so the list
 * stays accurate without a visible flash.
 */
function _handleSSEEvent(event) {
    if (!event || !event.type) return;

    const videoId = getCurrentVideoId();
    // Ignore events for other videos (shouldn't happen with per-videoId subscriptions,
    // but guard anyway in case of URL race during SPA navigation)
    if (event.videoId && event.videoId !== videoId) return;

    const citContainer = document.getElementById('citations-container');
    const reqContainer = document.getElementById('citation-requests-container');

    switch (event.type) {
        case 'citationAdded':
        case 'citationDeleted':
            if (citContainer?.style.display !== 'none') {
                loadCitations(1, true);
            }
            break;

        case 'citationVoteUpdated':
            // Update in-place — no full list reload needed just for a score change
            _applyVoteUpdate(event.citationId, event.voteScore, 'citation');
            break;

        case 'requestAdded':
        case 'requestDeleted':
            if (reqContainer?.style.display !== 'none') {
                loadCitationRequests(1, true);
            }
            break;

        case 'requestVoteUpdated':
            _applyVoteUpdate(event.requestId, event.voteScore, 'request');
            break;
    }
}

/**
 * Update a vote score in both the in-memory list and the rendered DOM
 * without triggering a full list reload.
 */
function _applyVoteUpdate(itemId, voteScore, itemType) {
    if (itemId == null || voteScore == null) return;
    const score = Number(voteScore);

    // Update in-memory list so sort-on-refresh uses the right score
    if (itemType === 'citation') {
        const item = currentCitations.find(c => c.id === itemId);
        if (item) item.voteScore = score;
    } else {
        const item = currentRequests.find(r => r.id === itemId);
        if (item) item.voteScore = score;
    }

    // Update live DOM score display
    const selector    = itemType === 'citation'
        ? `[data-citation-id="${itemId}"]`
        : `[data-request-id="${itemId}"]`;
    const voteControls = document.querySelector(selector);
    if (voteControls) {
        const scoreEl = voteControls.querySelector('.vote-score');
        if (scoreEl) scoreEl.textContent = score;
    }
}

// ── Polling (#2 + #8) ─────────────────────────
//
// Architecture:
//   • Tries SSE first (real-time push, no wasted polling).
//   • Keeps a slow safety-net poll running even when SSE is active,
//     in case the server drops an event.
//   • Falls back to normal 15 s polling if SSE fails _SSE_MAX_FAIL times.
//   • Slows to 60 s when the user has been idle > 2 minutes (#8).
//
// External interface is unchanged: startPolling() / stopPolling().

function _isIdle() {
    return Date.now() - _lastInteractionTime > _IDLE_THRESHOLD_MS;
}

function _wireIdleTracking() {
    if (_idleTrackingInstalled) return;
    _idleTrackingInstalled = true;
    // Passive listeners — no scroll/input performance impact
    const reset = () => { _lastInteractionTime = Date.now(); };
    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evt => {
        document.addEventListener(evt, reset, { passive: true, capture: false });
    });
}

function _doPoll() {
    const citContainer = document.getElementById('citations-container');
    const reqContainer = document.getElementById('citation-requests-container');
    if (citContainer?.style.display !== 'none')      loadCitations(1, true);
    else if (reqContainer?.style.display !== 'none') loadCitationRequests(1, true);


    const citVisible = document.getElementById('citations-container')?.style.display !== 'none';
    if (citVisible) loadRequestCount();
    else {
        const videoId = getCurrentVideoId();
        if (videoId && !_isContextInvalidated()) {
            apiGetCitations(videoId, 1, 1).then(({ pagination }) => {
                if (pagination) _updateCounter('citations-counter', pagination.total);
            }).catch(() => {});
        }
    }
}

function _getPollingInterval() {
    // Slow poll when SSE is alive (safety-net only) OR when user is idle
    const sseActive = _sseSource && _sseSource.readyState !== EventSource.CLOSED;
    return (sseActive || _isIdle()) ? _POLL_SLOW_MS : _POLL_FAST_MS;
}

function _schedulePoll() {
    if (_isContextInvalidated()) return;
    // Only schedule if polling is still active (stopPolling hasn't been called)
    if (!_pollingActive) return;
    const delay = _getPollingInterval();
    _pollTimeout = setTimeout(() => {
        _doPoll();
        _schedulePoll(); // reschedule with potentially updated interval
    }, delay);
}

function startPolling() {
    if (_isContextInvalidated()) return;
    // Detect video change — restart polling + SSE for the new videoId
    const videoId = getCurrentVideoId();
    if (_pollTimeout !== null && _sseVideoId && _sseVideoId === videoId) return; // already active

    // Clean up any previous session before starting fresh
    if (_pollTimeout !== null) {
        clearTimeout(_pollTimeout);
        _pollTimeout = null;
    }
    stopSSE();

    // Attempt SSE connection for real-time updates
    if (videoId) _connectSSE(videoId);

    // Wire up idle-activity tracking (one-time, survives across videos)
    _wireIdleTracking();

    // Schedule the polling safety-net
    _pollingActive = true;
    _schedulePoll();
}

function stopPolling() {
    _pollingActive = false;
    if (_pollTimeout !== null) {
        clearTimeout(_pollTimeout);
        _pollTimeout = null;
    }
    stopSSE();
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
}, 60); // 60 ms debounce — feels instant

// ── Private helpers ───────────────────────────

async function _appendCitationsPage(citations, container, pagination) {
    container.querySelector('.cp-load-more-btn')?.remove();

    const currentUsername = _currentUsername || await getCachedUsername();

    const requestGroups  = new Map();
    const replyGroups    = new Map();
    const standalone     = [];
    const parentIds      = new Set();

    for (const c of citations) {
        if (c.requestId && _requestsById[c.requestId]) {
            if (!requestGroups.has(c.requestId)) requestGroups.set(c.requestId, []);
            requestGroups.get(c.requestId).push(c);
        } else if (c.parentCitationId) {
            if (!replyGroups.has(c.parentCitationId)) replyGroups.set(c.parentCitationId, []);
            replyGroups.get(c.parentCitationId).push(c);
            parentIds.add(c.parentCitationId);
        } else {
            standalone.push(c);
        }
    }

    const parentsInList = new Map();
    const trueStandalone = [];
    for (const c of standalone) {
        if (parentIds.has(c.id) || replyGroups.has(c.id)) {
            parentsInList.set(c.id, c);
        } else {
            trueStandalone.push(c);
        }
    }

    const standaloneEls = await Promise.all(
        trueStandalone.map(c => createCitationElement(c, userVotes[c.id] || null, currentUsername))
    );
    const requestGroupEls = await Promise.all(
        [...requestGroups.entries()].map(([requestId, responses]) =>
            createRequestResponseGroupElement(_requestsById[requestId], responses, userVotes, currentUsername)
        )
    );
    const replyGroupEls = await Promise.all(
        [...replyGroups.entries()].map(([parentId, replies]) => {
            const parent = parentsInList.get(parentId);
            if (!parent) {
                return Promise.all(replies.map(c => createCitationElement(c, userVotes[c.id] || null, currentUsername)));
            }
            return createCitationReplyGroupElement(parent, replies, userVotes, currentUsername);
        })
    );

    [...standaloneEls, ...requestGroupEls, ...replyGroupEls.flat()].forEach(el => container.appendChild(el));

    if (pagination && pagination.page < pagination.pages) {
        const remaining = pagination.total - pagination.page * pagination.limit;
        const loadMore = document.createElement('button');
        loadMore.className   = 'cp-load-more-btn cp-btn cp-btn--secondary';
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
        loadMore.className   = 'cp-load-more-btn cp-btn cp-btn--secondary';
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
    if (typeof _updateMinimizedCounts === 'function') _updateMinimizedCounts();
}

async function loadCitationCount() {
    if (_isContextInvalidated()) return;
    const videoId = getCurrentVideoId();
    if (!videoId) return;
    try {
        const { pagination } = await apiGetCitations(videoId, 1, 1);
        if (pagination) _updateCounter('citations-counter', pagination.total);
    } catch (_) { /* non-fatal */ }
}

async function loadRequestCount() {
    if (_isContextInvalidated()) return;
    const videoId = getCurrentVideoId();
    if (!videoId) return;
    try {
        const { pagination } = await apiGetRequests(videoId, 1, 1);
        if (pagination) _updateCounter('requests-counter', pagination.total);
    } catch (_) { /* non-fatal */ }
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
 * Render a description with inline "Show more" for long text (#7).
 * Descriptions longer than 250 characters are truncated; the rest is
 * stored inline (no extra fetch needed — data is already loaded).
 *
 * The toggle button is wired in the calling createXxxElement function.
 */
async function _buildResponseEntry(citation, votes, currentUsername) {
    const userVote       = votes[citation.id] || null;
    const canDelete      = _isOwner(currentUsername, citation.username);
    const alreadyReported = !!_reportedItems[citation.id];

    const responseText = citation.description?.startsWith('Response to request:')
        ? citation.description.split('\n\n').slice(1).join('\n\n').trim()
        : citation.description;

    const el = document.createElement('div');
    el.className = 'rg-response-entry';
    el.dataset.category = citation.category || DEFAULT_CATEGORY;
    el.innerHTML = `
        ${_buildDescription(responseText)}
        <div class="citation-meta">
            <span class="citation-author">${_escapeHtml(citation.username || 'Anonymous')}</span>
            <span class="citation-date">${_formatDate(citation.dateAdded)}</span>
        </div>
        <div class="citation-actions">
            ${_safeSourceLink(citation.source)}
            <div class="citation-actions-right">
                <div class="vote-controls" data-citation-id="${citation.id}">
                    <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
                    <span class="vote-score">${citation.voteScore ?? 0}</span>
                    <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
                </div>
                <div class="action-buttons">
                    ${!canDelete ? `<button class="action-btn respond-btn inline-reply-btn" data-id="${citation.id}">Reply</button>` : ''}
                    ${canDelete ? `<button class="action-btn delete-btn" data-id="${citation.id}">Delete</button>` : ''}
                    ${!canDelete ? `<button class="action-btn report-btn" data-id="${citation.id}" ${alreadyReported ? 'disabled title="Already reported"' : ''}>Report</button>` : ''}
                </div>
            </div>
        </div>
    `;

    el.querySelector('.cp-desc-toggle')?.addEventListener('click', function () {
        const p = this.closest('.citation-description');
        p.querySelector('.cp-desc-full').style.display = 'inline';
        p.querySelector('.cp-desc-dots').style.display = 'none';
        this.style.display = 'none';
    });

    const vc = el.querySelector('.vote-controls');
    vc.querySelector('.upvote-btn').addEventListener('click', () => handleVote(citation.id, 'up', 'citation'));
    vc.querySelector('.downvote-btn').addEventListener('click', () => handleVote(citation.id, 'down', 'citation'));

    if (canDelete) {
        el.querySelector('.delete-btn').addEventListener('click', async () => {
            const confirmed = await showConfirm('Delete this citation?');
            if (!confirmed) return;
            el.remove();
            currentCitations = currentCitations.filter(c => c.id !== citation.id);
            try {
                await apiDeleteCitation(citation.id, getCurrentVideoId(), currentUsername);
            } catch (err) {
                showToast('Failed to delete citation. Please try again.', 'error');
                _votesLoaded = false; _votesVideoId = null; _citationsLoading = false;
                loadCitations(1, false);
            }
        });
    }

    if (!canDelete) {
        el.querySelector('.report-btn')?.addEventListener('click', () =>
            showReportDialog(citation.id, 'citation')
        );
        el.querySelector('.inline-reply-btn')?.addEventListener('click', () => {
            _showInlineReplyForm(el, citation.id);
        });
    }

    return el;
}

async function _showInlineReplyForm(targetEl, parentCitationId) {
    if (targetEl.querySelector('.inline-reply-form')) return;

    const form = document.createElement('div');
    form.className = 'inline-reply-form';
    form.innerHTML = `
        <textarea placeholder="Write a reply..." rows="2"></textarea>
        <div class="inline-reply-actions">
            <button class="inline-reply-submit">Reply</button>
            <button class="inline-reply-cancel">Cancel</button>
        </div>
    `;
    targetEl.appendChild(form);

    const textarea = form.querySelector('textarea');
    textarea.focus();

    form.querySelector('.inline-reply-cancel').addEventListener('click', () => form.remove());

    form.querySelector('.inline-reply-submit').addEventListener('click', async () => {
        const text = textarea.value.trim();
        if (!text) return;

        const submitBtn = form.querySelector('.inline-reply-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            const username = _currentUsername || await getYouTubeUsername();
            if (!username) throw new Error('You must be logged in to reply.');

            const videoId = getCurrentVideoId();
            if (!videoId) throw new Error('Could not determine video ID.');

            await apiAddQuickReply(parentCitationId, text, videoId, username);
            if (typeof showToast === 'function') showToast('Reply added!', 'success');
            form.remove();
            _votesLoaded = false;
            _votesVideoId = null;
            _citationsLoading = false;
            loadCitations(1, true);
        } catch (err) {
            console.error('[citations] Reply failed:', err);
            if (typeof showToast === 'function') showToast(err.message || 'Failed to submit reply.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reply';
        }
    });
}

function _buildDescription(text) {
    if (!text) return '';
    const LIMIT = 250;
    if (text.length <= LIMIT) {
        return `<p class="citation-description">${_escapeHtml(text)}</p>`;
    }
    return `<p class="citation-description">\
<span class="cp-desc-preview">${_escapeHtml(text.slice(0, LIMIT))}</span>\
<span class="cp-desc-dots">…</span>\
<span class="cp-desc-full" style="display:none">${_escapeHtml(text.slice(LIMIT))}</span>\
 <button class="cp-desc-toggle" type="button" style="background:none;border:none;color:inherit;cursor:pointer;font-size:0.85em;padding:0;text-decoration:underline">Show more</button>\
</p>`;
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
