// ─────────────────────────────────────────────
// discussion.js
// Reddit-style threaded discussion page for
// citation and request threads.
// Depends on: api.js, username.js, config/config.js
// ─────────────────────────────────────────────

let _threadTree    = [];
let _threadItems   = [];
let _currentSort   = 'top';
let _threadType    = null;
let _threadId      = null;
let _currentUser   = null;
let _collapsedIds  = new Set();
let _userVotes     = {};
let _videoId       = null;

const MAX_VISUAL_DEPTH = 5;

function _escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// Only http(s) URLs are safe to render as an href — blocks javascript:,
// data:, and other schemes that would execute in the extension page context.
// Same technique as content/citations.js's _safeSourceLink().
function _safeUrl(str) {
    if (typeof str !== 'string' || !str) return null;
    try {
        const parsed = new URL(str);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? str : null;
    } catch {
        return null;
    }
}

function _formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function _parseParams() {
    const params = new URLSearchParams(window.location.search);
    return { type: params.get('type'), id: params.get('id') };
}

function _timestampToSeconds(ts) {
    if (!ts) return 0;
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function _countAllReplies(items) {
    let count = 0;
    for (const item of items) {
        count++;
        if (item.children) count += _countAllReplies(item.children);
    }
    return count;
}

// ── Voting ───────────────────────────────────

function _buildVoteControls(item, itemType = 'citation') {
    const vote = _userVotes[item.id || item._id] || null;
    return `
        <div class="vote-controls" data-item-id="${item.id || item._id}" data-item-type="${itemType}">
            <button class="vote-btn upvote-btn ${vote === 'up' ? 'voted' : ''}" title="${vote === 'up' ? 'Remove upvote' : 'Upvote'}">▲</button>
            <span class="vote-score">${item.voteScore ?? 0}</span>
            <button class="vote-btn downvote-btn ${vote === 'down' ? 'voted' : ''}" title="${vote === 'down' ? 'Remove downvote' : 'Downvote'}">▼</button>
        </div>
    `;
}

function _wireVoteControls(container) {
    container.querySelectorAll('.vote-controls').forEach(vc => {
        const itemId   = vc.dataset.itemId;
        const itemType = vc.dataset.itemType;
        vc.querySelector('.upvote-btn').addEventListener('click',  () => _handleVote(itemId, 'up', itemType, vc));
        vc.querySelector('.downvote-btn').addEventListener('click', () => _handleVote(itemId, 'down', itemType, vc));
    });
}

async function _handleVote(itemId, voteType, itemType, vc) {
    if (!_currentUser) {
        _currentUser = await getYouTubeUsername();
        if (!_currentUser) {
            alert('You must be logged in to vote. Please visit a YouTube video first so the extension can detect your account.');
            return;
        }
    }
    if (!_videoId) return;

    const upBtn   = vc.querySelector('.upvote-btn');
    const downBtn = vc.querySelector('.downvote-btn');
    const scoreEl = vc.querySelector('.vote-score');

    // Guard against double-submit (rapid double-click) firing two concurrent votes.
    if (upBtn.disabled || downBtn.disabled) return;
    upBtn.disabled   = true;
    downBtn.disabled = true;

    const current = parseInt(scoreEl.textContent || '0', 10);
    const wasUp   = upBtn.classList.contains('voted');
    const wasDown = downBtn.classList.contains('voted');

    let newScore = current;
    if (voteType === 'up') {
        if (wasUp) { newScore--; upBtn.classList.remove('voted'); }
        else { newScore++; if (wasDown) newScore++; upBtn.classList.add('voted'); downBtn.classList.remove('voted'); }
    } else {
        if (wasDown) { newScore++; downBtn.classList.remove('voted'); }
        else { newScore--; if (wasUp) newScore--; downBtn.classList.add('voted'); upBtn.classList.remove('voted'); }
    }
    scoreEl.textContent = newScore;

    try {
        const result = await _send({ type: 'updateVotes', itemId, voteType, itemType, videoId: _videoId, username: _currentUser });
        if (result.newScore !== undefined) scoreEl.textContent = result.newScore;
    } catch (err) {
        console.error('[discussion] Vote failed:', err);
        scoreEl.textContent = current;
        if (wasUp) upBtn.classList.add('voted'); else upBtn.classList.remove('voted');
        if (wasDown) downBtn.classList.add('voted'); else downBtn.classList.remove('voted');
    } finally {
        upBtn.disabled   = false;
        downBtn.disabled = false;
    }
}

async function _loadUserVotes() {
    if (!_videoId || !_currentUser) return;
    try {
        const citVotes = await _send({ type: 'getUserVotes', videoId: _videoId, itemType: 'citation' });
        const reqVotes = await _send({ type: 'getUserVotes', videoId: _videoId, itemType: 'request' });
        _userVotes = { ...(citVotes.votes || {}), ...(reqVotes.votes || {}) };
    } catch (_) {}
}

// ── Thread Loading ───────────────────────────

async function _loadThread() {
    const { type, id } = _parseParams();
    _threadType = type;
    _threadId   = id;

    if (!type || !id) {
        document.getElementById('loading').textContent = 'Invalid discussion link.';
        return;
    }

    try {
        _currentUser = await getYouTubeUsername();
    } catch (_) {}

    try {
        let res;
        if (type === 'citation') {
            res = await _send({ type: 'getDiscussionCitationTree', id });
            _videoId = res.citation?.videoId || null;
            await _loadUserVotes();

            document.getElementById('loading').style.display = 'none';
            document.getElementById('original-item').style.display = 'block';
            document.getElementById('thread-controls').style.display = 'flex';

            _renderOriginalCitation(res.citation);
            _threadTree = res.replies || [];
            const total = _countAllReplies(_threadTree);
            document.getElementById('response-count').textContent =
                `${total} ${total === 1 ? 'reply' : 'replies'}`;
            _renderThreadTree();
        } else {
            res = await _send({ type: 'getDiscussionRequest', id });
            _videoId = res.request?.videoId || null;
            await _loadUserVotes();

            document.getElementById('loading').style.display = 'none';
            document.getElementById('original-item').style.display = 'block';
            document.getElementById('thread-controls').style.display = 'flex';

            _renderOriginalRequest(res.request);
            _threadItems = res.responses || [];
            document.getElementById('response-count').textContent =
                `${_threadItems.length} ${_threadItems.length === 1 ? 'response' : 'responses'}`;
            _renderFlatList();
        }
    } catch (err) {
        document.getElementById('loading').textContent = 'Error loading discussion: ' + err.message;
    }
}

// ── Original Item Rendering ──────────────────

function _renderOriginalCitation(c) {
    const el = document.getElementById('original-item');
    el.innerHTML = `
        <div class="original-card">
            <h2 class="original-title">${_escapeHtml(c.citationTitle || 'Untitled')}</h2>
            <div class="original-meta">
                <span class="original-timestamp">${_escapeHtml(c.timestampStart)} → ${_escapeHtml(c.timestampEnd)}</span>
                <span class="original-author">${_escapeHtml(c.username || 'Anonymous')}</span>
                <span class="original-date">${_formatDate(c.dateAdded)}</span>
            </div>
            ${c.category ? `<span class="original-category">${_escapeHtml(c.category)}</span>` : ''}
            ${c.description ? `<p class="original-description">${_escapeHtml(c.description)}</p>` : ''}
            ${_safeUrl(c.source) ? `<a class="original-source" href="${_escapeHtml(_safeUrl(c.source))}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
            ${_buildVoteControls(c, 'citation')}
            ${c.videoId ? `<a class="video-link" href="https://www.youtube.com/watch?v=${_escapeHtml(c.videoId)}&t=${_timestampToSeconds(c.timestampStart)}" target="_blank">Watch on YouTube ↗</a>` : ''}
        </div>
    `;
    _wireVoteControls(el);
}

function _renderOriginalRequest(r) {
    const el = document.getElementById('original-item');
    el.innerHTML = `
        <div class="original-card original-request">
            <span class="request-label">Citation Request</span>
            <h2 class="original-title">${_escapeHtml(r.title || 'Untitled Request')}</h2>
            <div class="original-meta">
                <span class="original-timestamp">${_escapeHtml(r.timestampStart)} → ${_escapeHtml(r.timestampEnd)}</span>
                <span class="original-author">${_escapeHtml(r.username || 'Anonymous')}</span>
                <span class="original-date">${_formatDate(r.dateAdded)}</span>
            </div>
            ${r.category ? `<span class="original-category">${_escapeHtml(r.category)}</span>` : ''}
            ${r.reason ? `<p class="original-description">${_escapeHtml(r.reason)}</p>` : ''}
            ${_buildVoteControls(r, 'request')}
            ${r.videoId ? `<a class="video-link" href="https://www.youtube.com/watch?v=${_escapeHtml(r.videoId)}&t=${_timestampToSeconds(r.timestampStart)}" target="_blank">Watch on YouTube ↗</a>` : ''}
        </div>
    `;
    _wireVoteControls(el);
}

// ── Nested Tree Rendering (citation threads) ─

function _sortTopLevel(items) {
    const sorted = [...items];
    if (_currentSort === 'top') {
        sorted.sort((a, b) => {
            const av = a.categoryVerified ? 1 : 0, bv = b.categoryVerified ? 1 : 0;
            if (bv !== av) return bv - av;
            return (b.voteScore ?? 0) - (a.voteScore ?? 0);
        });
    } else if (_currentSort === 'new') {
        sorted.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    } else {
        sorted.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
    }
    return sorted;
}

function _renderThreadTree() {
    const list = document.getElementById('thread-list');
    list.innerHTML = '';

    if (_threadTree.length === 0) {
        list.innerHTML = '<p class="empty-message">No replies yet. Be the first to reply!</p>';
        return;
    }

    const sorted = _sortTopLevel(_threadTree);
    _renderNodes(sorted, list, 0);
}

function _renderNodes(items, container, depth) {
    for (const item of items) {
        const node = _createThreadNode(item, depth);
        container.appendChild(node);
    }
}

function _createThreadNode(item, depth) {
    const nodeEl = document.createElement('div');
    nodeEl.className = `thread-node ${depth > 0 ? 'thread-node--nested' : ''}`;
    nodeEl.dataset.id = item.id || item._id;

    const isOwner  = _currentUser && item.username === _currentUser;
    const hasKids  = item.children && item.children.length > 0;
    const collapsed = _collapsedIds.has(nodeEl.dataset.id);
    const childCount = hasKids ? _countAllReplies(item.children) : 0;

    const desc = item.description?.startsWith('Response to request:')
        ? item.description.split('\n\n').slice(1).join('\n\n').trim()
        : item.description;

    const itemEl = document.createElement('div');
    itemEl.className = 'thread-item';
    itemEl.innerHTML = `
        <div class="thread-item-header">
            ${hasKids ? `<button class="thread-collapse-btn" title="${collapsed ? 'Expand' : 'Collapse'}">[${collapsed ? '+' : '−'}]</button>` : ''}
            <span class="thread-author">${_escapeHtml(item.username || 'Anonymous')}</span>
            ${item.categoryVerified ? '<span class="expert-badge">Expert</span>' : ''}
            <span class="thread-date">${_formatDate(item.dateAdded)}</span>
        </div>
        <div class="thread-item-body ${collapsed ? 'thread-collapsed' : ''}">
            <p class="thread-description">${_escapeHtml(desc)}</p>
            ${_safeUrl(item.source) ? `<a class="thread-source" href="${_escapeHtml(_safeUrl(item.source))}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
            <div class="thread-item-actions">
                ${_buildVoteControls(item, 'citation')}
                ${!isOwner ? `<button class="thread-reply-btn" data-id="${item.id || item._id}">Reply</button>` : ''}
                ${isOwner ? `<button class="thread-delete-btn" data-id="${item.id || item._id}">Delete</button>` : ''}
            </div>
        </div>
    `;

    _wireVoteControls(itemEl);
    nodeEl.appendChild(itemEl);

    // Collapse toggle
    const collapseBtn = itemEl.querySelector('.thread-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            const id = nodeEl.dataset.id;
            if (_collapsedIds.has(id)) {
                _collapsedIds.delete(id);
                collapseBtn.textContent = '[−]';
                collapseBtn.title = 'Collapse';
            } else {
                _collapsedIds.add(id);
                collapseBtn.textContent = '[+]';
                collapseBtn.title = `Expand (${childCount} ${childCount === 1 ? 'reply' : 'replies'})`;
            }
            const body = itemEl.querySelector('.thread-item-body');
            const childrenEl = nodeEl.querySelector('.thread-children');
            if (body) body.classList.toggle('thread-collapsed');
            if (childrenEl) childrenEl.classList.toggle('thread-collapsed');
        });
    }

    // Reply button
    const replyBtn = itemEl.querySelector('.thread-reply-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
            _showReplyForm(nodeEl, item);
        });
    }

    // Delete button
    const deleteBtn = itemEl.querySelector('.thread-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('Delete this reply?')) return;
            try {
                await _send({ type: 'deleteCitation', citationId: item.id || item._id, videoId: item.videoId, username: _currentUser });
                nodeEl.remove();
            } catch (err) {
                alert('Failed to delete: ' + err.message);
            }
        });
    }

    // Children
    if (hasKids) {
        if (depth >= MAX_VISUAL_DEPTH) {
            const continueLink = document.createElement('a');
            continueLink.className = 'thread-continue-link';
            continueLink.href = `discussion.html?type=citation&id=${item.id || item._id}`;
            continueLink.textContent = `Continue this thread (${childCount} more) →`;
            nodeEl.appendChild(continueLink);
        } else {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = `thread-children ${collapsed ? 'thread-collapsed' : ''}`;
            _renderNodes(item.children, childrenContainer, depth + 1);
            nodeEl.appendChild(childrenContainer);
        }
    }

    return nodeEl;
}

// ── Flat List Rendering (request threads) ────

function _renderFlatList() {
    const list = document.getElementById('thread-list');
    list.innerHTML = '';

    const sorted = _sortTopLevel(_threadItems);

    if (sorted.length === 0) {
        list.innerHTML = '<p class="empty-message">No responses yet. Be the first to respond!</p>';
        return;
    }

    sorted.forEach(item => {
        const isOwner = _currentUser && item.username === _currentUser;
        const desc = item.description?.startsWith('Response to request:')
            ? item.description.split('\n\n').slice(1).join('\n\n').trim()
            : item.description;

        const div = document.createElement('div');
        div.className = 'thread-item';
        div.innerHTML = `
            <div class="thread-item-header">
                <span class="thread-author">${_escapeHtml(item.username || 'Anonymous')}</span>
                ${item.categoryVerified ? '<span class="expert-badge">Expert</span>' : ''}
                <span class="thread-date">${_formatDate(item.dateAdded)}</span>
            </div>
            <p class="thread-description">${_escapeHtml(desc)}</p>
            ${_safeUrl(item.source) ? `<a class="thread-source" href="${_escapeHtml(_safeUrl(item.source))}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
            <div class="thread-item-actions">
                ${_buildVoteControls(item, 'citation')}
                ${!isOwner ? `<button class="thread-reply-btn" data-id="${item.id || item._id}">Reply</button>` : ''}
                ${isOwner ? `<button class="thread-delete-btn" data-id="${item.id || item._id}">Delete</button>` : ''}
            </div>
        `;

        _wireVoteControls(div);

        const replyBtn = div.querySelector('.thread-reply-btn');
        if (replyBtn) {
            replyBtn.addEventListener('click', () => {
                _showReplyForm(div, item);
            });
        }

        const deleteBtn = div.querySelector('.thread-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (!confirm('Delete this response?')) return;
                try {
                    await _send({ type: 'deleteCitation', citationId: item.id || item._id, videoId: item.videoId, username: _currentUser });
                    div.remove();
                } catch (err) {
                    alert('Failed to delete: ' + err.message);
                }
            });
        }

        list.appendChild(div);
    });
}

// ── Inline Reply Form ────────────────────────

function _showReplyForm(parentEl, parentItem) {
    if (parentEl.querySelector('.thread-reply-form')) return;

    const form = document.createElement('div');
    form.className = 'thread-reply-form';
    form.innerHTML = `
        <textarea placeholder="Write a reply..." rows="3"></textarea>
        <div class="thread-reply-actions">
            <button class="reply-submit-btn cp-btn cp-btn--primary">Reply</button>
            <button class="reply-cancel-btn cp-btn cp-btn--secondary">Cancel</button>
        </div>
    `;

    const bodyEl = parentEl.querySelector('.thread-item-body') || parentEl;
    bodyEl.after(form);

    const textarea = form.querySelector('textarea');
    textarea.focus();

    form.querySelector('.reply-cancel-btn').addEventListener('click', () => {
        form.remove();
    });

    form.querySelector('.reply-submit-btn').addEventListener('click', async () => {
        const text = textarea.value.trim();
        if (!text) return;

        const submitBtn = form.querySelector('.reply-submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            if (!_currentUser) {
                _currentUser = await getYouTubeUsername();
            }
            if (!_currentUser) throw new Error('You must be logged in to reply.');

            await _send({
                type: 'addQuickReply',
                parentCitationId: parentItem.id || parentItem._id,
                description: text,
                videoId: parentItem.videoId,
                username: _currentUser,
            });

            form.remove();
            _loadThread();
        } catch (err) {
            alert('Failed to submit reply: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reply';
        }
    });
}

// ── Init ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    _loadThread();

    document.getElementById('thread-sort').addEventListener('change', e => {
        _currentSort = e.target.value;
        if (_threadType === 'citation') {
            _renderThreadTree();
        } else {
            _renderFlatList();
        }
    });
});
