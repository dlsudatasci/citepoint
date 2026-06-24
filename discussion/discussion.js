// ─────────────────────────────────────────────
// discussion.js
// Forum-style discussion page for a single
// citation or request thread.
// Depends on: api.js, config/config.js
// ─────────────────────────────────────────────

let _threadItems = [];
let _currentSort = 'top';

function _escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
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

async function _loadThread() {
    const { type, id } = _parseParams();
    if (!type || !id) {
        document.getElementById('loading').textContent = 'Invalid discussion link.';
        return;
    }

    try {
        const res = await _send({ type: type === 'citation' ? 'getDiscussionCitation' : 'getDiscussionRequest', id });

        document.getElementById('loading').style.display = 'none';
        document.getElementById('original-item').style.display = 'block';
        document.getElementById('thread-controls').style.display = 'flex';

        if (type === 'citation') {
            _renderOriginalCitation(res.citation);
            _threadItems = res.replies || [];
        } else {
            _renderOriginalRequest(res.request);
            _threadItems = res.responses || [];
        }

        document.getElementById('response-count').textContent =
            `${_threadItems.length} ${_threadItems.length === 1 ? 'response' : 'responses'}`;

        _sortAndRender();
    } catch (err) {
        document.getElementById('loading').textContent = 'Error loading discussion: ' + err.message;
    }
}

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
            ${c.source ? `<a class="original-source" href="${_escapeHtml(c.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
            <div class="original-score">▲ ${c.voteScore ?? 0}</div>
            ${c.videoId ? `<a class="video-link" href="https://www.youtube.com/watch?v=${_escapeHtml(c.videoId)}&t=${_timestampToSeconds(c.timestampStart)}" target="_blank">Watch on YouTube ↗</a>` : ''}
        </div>
    `;
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
            <div class="original-score">▲ ${r.voteScore ?? 0}</div>
            ${r.videoId ? `<a class="video-link" href="https://www.youtube.com/watch?v=${_escapeHtml(r.videoId)}&t=${_timestampToSeconds(r.timestampStart)}" target="_blank">Watch on YouTube ↗</a>` : ''}
        </div>
    `;
}

function _timestampToSeconds(ts) {
    if (!ts) return 0;
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function _sortAndRender() {
    const sorted = [..._threadItems];
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

    const list = document.getElementById('thread-list');
    list.innerHTML = '';

    if (sorted.length === 0) {
        list.innerHTML = '<p class="empty-message">No responses yet.</p>';
        return;
    }

    sorted.forEach(item => {
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
            ${item.source ? `<a class="thread-source" href="${_escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}
            ${item.category ? `<span class="thread-category">${_escapeHtml(item.category)}</span>` : ''}
            <div class="thread-score">▲ ${item.voteScore ?? 0}</div>
        `;
        list.appendChild(div);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    _loadThread();

    document.getElementById('thread-sort').addEventListener('change', e => {
        _currentSort = e.target.value;
        _sortAndRender();
    });
});
