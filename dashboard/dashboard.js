// ─────────────────────────────────────────────
// dashboard.js
// Standalone dashboard page — fetches trending
// category stats and renders simple CSS bar charts.
// Depends on: api.js, config/config.js
// ─────────────────────────────────────────────

const CATEGORY_COLORS = {
    'Statistics & Data':      { bg: 'rgba(101, 31, 255, 0.12)', color: '#651fff' },
    'Quote / Misattribution': { bg: 'rgba(230, 81, 0, 0.12)',   color: '#e65100' },
    'Historical Claim':       { bg: 'rgba(0, 137, 123, 0.12)',  color: '#00897b' },
    'Scientific Claim':       { bg: 'rgba(6, 95, 212, 0.12)',   color: '#065fd4' },
    'Context / Methodology':  { bg: 'rgba(194, 24, 91, 0.12)',  color: '#c2185b' },
    'Other':                  { bg: 'rgba(0, 0, 0, 0.07)',      color: '#606060' },
    'Uncategorized':          { bg: 'rgba(0, 0, 0, 0.05)',      color: '#9e9e9e' },
};

function _categoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['Uncategorized'];
}

function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

/**
 * Try to find the videoId of the YouTube video the user was watching.
 * Returns null if no YouTube watch tab is found (falls back to global scope).
 */
async function _getActiveVideoId() {
    return new Promise(resolve => {
        try {
            chrome.tabs.query({ url: ['*://www.youtube.com/watch*', '*://m.youtube.com/watch*'] }, tabs => {
                if (chrome.runtime.lastError || !tabs || tabs.length === 0) return resolve(null);
                try {
                    const url = new URL(tabs[0].url);
                    resolve(url.searchParams.get('v'));
                } catch (_) {
                    resolve(null);
                }
            });
        } catch (_) {
            resolve(null);
        }
    });
}

function _renderBarChart(container, data) {
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="empty-message">No data available.</p>';
        return;
    }

    const max = Math.max(...data.map(d => d.count), 1);

    data.forEach(({ category, count }) => {
        const colors = _categoryColor(category);
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
            <span class="bar-label">${_escapeHtml(category)}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${(count / max) * 100}%;background-color:${colors.color}"></div>
            </div>
            <span class="bar-count">${count}</span>
        `;
        container.appendChild(row);
    });
}

function _renderStackedChart(container, data) {
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="empty-message">No data available.</p>';
        return;
    }

    const max = Math.max(...data.map(d => d.verified + d.unverified), 1);

    data.forEach(({ category, verified, unverified }) => {
        const total = verified + unverified;
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
            <span class="bar-label">${_escapeHtml(category)}</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill-verified" style="width:${(verified / max) * 100}%"></div>
                <div class="bar-fill bar-fill-unverified" style="width:${(unverified / max) * 100}%"></div>
            </div>
            <span class="bar-count">${verified} / ${total}</span>
        `;
        container.appendChild(row);
    });
}

async function _loadStats() {
    const scope   = document.getElementById('scope-select').value;
    const videoId = scope === 'video' ? await _getActiveVideoId() : null;

    try {
        const stats = await apiGetDashboardStats(videoId);

        _renderBarChart(document.getElementById('requests-chart'), stats.requestsByCategory);
        _renderBarChart(document.getElementById('citations-chart'), stats.citationsByCategory);
        _renderStackedChart(document.getElementById('citations-verification-chart'), stats.verificationStats.citations);
        _renderStackedChart(document.getElementById('requests-verification-chart'), stats.verificationStats.requests);
    } catch (err) {
        console.error('[dashboard] Error loading stats:', err);
        const content = document.getElementById('dashboard-content');
        content.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'error-message';
        p.textContent = `Error loading dashboard stats: ${err.message}`;
        content.appendChild(p);
    }
}

// ── Notifications Section ────────────────────

async function _loadNotifications() {
    const username = await _getUsername();
    const listEl   = document.getElementById('notifications-list');
    const badgeEl  = document.getElementById('notif-badge');
    const markBtn  = document.getElementById('mark-all-read-btn');

    if (!username) {
        listEl.innerHTML = '<p class="empty-message">Log in to YouTube to see notifications.</p>';
        return;
    }

    try {
        const res = await apiGetNotifications(username, 1);
        const { notifications, unreadCount } = res;

        if (unreadCount > 0) {
            badgeEl.textContent = unreadCount;
            badgeEl.style.display = 'inline-block';
            markBtn.style.display = 'inline-block';
        }

        markBtn.addEventListener('click', async () => {
            await apiMarkAllNotificationsRead(username);
            badgeEl.style.display = 'none';
            markBtn.style.display = 'none';
            listEl.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
        });

        if (notifications.length === 0) {
            listEl.innerHTML = '<p class="empty-message">No notifications yet.</p>';
            return;
        }

        listEl.innerHTML = '';
        notifications.forEach(n => {
            const div = document.createElement('div');
            div.className = `notif-item ${n.read ? '' : 'unread'}`;
            const icon = n.type === 'new_citation' ? '📄' : n.type === 'new_request' ? '❓' : n.type === 'application_approved' ? '✅' : '❌';
            div.innerHTML = `
                <span class="notif-icon">${icon}</span>
                <div class="notif-body">
                    <span class="notif-title">${_escapeHtml(n.title)}</span>
                    ${n.category ? `<span class="notif-category">${_escapeHtml(n.category)}</span>` : ''}
                    <span class="notif-time">${new Date(n.createdAt).toLocaleDateString()}</span>
                </div>
            `;
            if (!n.read) {
                div.addEventListener('click', async () => {
                    await apiMarkNotificationRead(n._id, username);
                    div.classList.remove('unread');
                });
            }
            listEl.appendChild(div);
        });
    } catch (err) {
        console.error('[dashboard] Notifications error:', err);
        listEl.innerHTML = '<p class="error-message">Could not load notifications.</p>';
    }
}

// ── Profile Section ──────────────────────────

async function _loadProfileSection() {
    const username = await _getUsername();
    const statsEl  = document.getElementById('profile-stats');
    const formEl   = document.getElementById('profile-form');
    const histEl   = document.getElementById('profile-history');

    if (!username) {
        statsEl.innerHTML = '<p class="empty-message">Log in to YouTube to view your profile.</p>';
        return;
    }

    try {
        const res = await apiGetProfile(username);
        const { profile, stats, expert } = res;

        statsEl.innerHTML = `
            <div class="stat-card"><span class="stat-number">${stats.citations}</span><span class="stat-label">Citations</span></div>
            <div class="stat-card"><span class="stat-number">${stats.requests}</span><span class="stat-label">Requests</span></div>
            <div class="stat-card"><span class="stat-number">${stats.upvotes}</span><span class="stat-label">Upvotes</span></div>
            ${expert ? `<div class="stat-card stat-expert"><span class="stat-number">✓</span><span class="stat-label">Expert: ${_escapeHtml(expert.categories.join(', '))}</span></div>` : ''}
        `;

        formEl.style.display = 'block';
        document.getElementById('profile-display-name').value = profile.displayName || '';
        document.getElementById('profile-bio').value = profile.bio || '';

        formEl.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                await apiUpdateProfile(username, {
                    displayName: document.getElementById('profile-display-name').value.trim(),
                    bio: document.getElementById('profile-bio').value.trim(),
                });
                const btn = formEl.querySelector('.submit-btn');
                btn.textContent = 'Saved!';
                setTimeout(() => { btn.textContent = 'Save Profile'; }, 2000);
            } catch (err) {
                alert('Error saving profile: ' + err.message);
            }
        });

        const history = await apiGetProfileHistory(username, 1);
        if (history.citations.length > 0 || history.requests.length > 0) {
            histEl.innerHTML = '<h3>Recent Activity</h3>';
            const items = [
                ...history.citations.map(c => ({ type: 'Citation', title: c.citationTitle, date: c.dateAdded, score: c.voteScore })),
                ...history.requests.map(r => ({ type: 'Request', title: r.title, date: r.dateAdded, score: r.voteScore })),
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <span class="history-type ${item.type === 'Citation' ? 'type-citation' : 'type-request'}">${item.type}</span>
                    <span class="history-title">${_escapeHtml(item.title || 'Untitled')}</span>
                    <span class="history-score">▲ ${item.score ?? 0}</span>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                `;
                histEl.appendChild(div);
            });
        }
    } catch (err) {
        console.error('[dashboard] Profile error:', err);
        statsEl.innerHTML = '<p class="error-message">Could not load profile.</p>';
    }
}

// ── Expert Application Section ───────────────

async function _getUsername() {
    return new Promise(resolve => {
        try {
            chrome.storage.local.get(['youtubeUsername'], result => {
                resolve(result.youtubeUsername || null);
            });
        } catch (_) {
            resolve(null);
        }
    });
}

async function _loadExpertSection() {
    const username = await _getUsername();
    const statusEl = document.getElementById('expert-status');
    const formEl   = document.getElementById('expert-apply-form');
    const listEl   = document.getElementById('expert-applications-list');

    if (!username) {
        statusEl.innerHTML = '<p class="empty-message">Log in to YouTube to manage expert status.</p>';
        return;
    }

    try {
        const res = await _send({ type: 'checkExpert', username });
        if (res.isExpert) {
            const cats = res.categories && res.categories.length > 0
                ? res.categories.join(', ')
                : 'All categories';
            statusEl.innerHTML = `<div class="expert-badge-banner"><span class="expert-check">✓</span> Verified Expert — ${cats}</div>`;
        } else {
            statusEl.innerHTML = '<p>You are not yet a verified expert.</p>';
            formEl.style.display = 'block';
        }

        const apps = await apiGetMyApplications(username);
        if (apps.length > 0) {
            listEl.innerHTML = '<h3>Your Applications</h3>';
            apps.forEach(app => {
                const statusClass = app.status === 'approved' ? 'status-approved' : app.status === 'rejected' ? 'status-rejected' : 'status-pending';
                const div = document.createElement('div');
                div.className = 'application-card';
                div.innerHTML = `
                    <div class="app-header">
                        <span class="app-category">${_escapeHtml(app.category)}</span>
                        <span class="app-status ${statusClass}">${_escapeHtml(app.status)}</span>
                    </div>
                    <p class="app-credentials">${_escapeHtml(app.credentials)}</p>
                    ${app.reason ? `<p class="app-reason">Reason: ${_escapeHtml(app.reason)}</p>` : ''}
                    <span class="app-date">Submitted ${new Date(app.submittedAt).toLocaleDateString()}</span>
                `;
                listEl.appendChild(div);
            });
        }

        // Wire application form
        const form = document.getElementById('expert-application-form');
        form?.addEventListener('submit', async e => {
            e.preventDefault();
            const category    = document.getElementById('expert-category').value;
            const credentials = document.getElementById('expert-credentials').value.trim();
            if (!category || !credentials) return;

            try {
                await apiApplyExpert(username, category, credentials);
                form.reset();
                formEl.innerHTML = '<p class="success-message">Application submitted! You will be notified when reviewed.</p>';
                _loadExpertSection();
            } catch (err) {
                alert('Error: ' + (err.message || 'Failed to submit application'));
            }
        });

        // Admin section — only show for existing experts
        if (res.isExpert) {
            _loadAdminSection(username);
        }
    } catch (err) {
        console.error('[dashboard] Expert section error:', err);
        statusEl.innerHTML = '<p class="error-message">Could not load expert status.</p>';
    }
}

async function _loadAdminSection(adminUsername) {
    const section = document.getElementById('admin-section');
    const listEl  = document.getElementById('admin-pending-list');

    try {
        const apps = await apiGetPendingApplications();
        if (apps.length === 0) {
            section.style.display = 'block';
            listEl.innerHTML = '<p class="empty-message">No pending applications.</p>';
            return;
        }

        section.style.display = 'block';
        listEl.innerHTML = '';

        apps.forEach(app => {
            const div = document.createElement('div');
            div.className = 'application-card admin-card';
            div.innerHTML = `
                <div class="app-header">
                    <span class="app-username">${_escapeHtml(app.username)}</span>
                    <span class="app-category">${_escapeHtml(app.category)}</span>
                </div>
                <p class="app-credentials">${_escapeHtml(app.credentials)}</p>
                <span class="app-date">Submitted ${new Date(app.submittedAt).toLocaleDateString()}</span>
                <div class="admin-actions">
                    <button class="approve-btn" data-id="${app._id}">Approve</button>
                    <button class="reject-btn" data-id="${app._id}">Reject</button>
                </div>
            `;

            div.querySelector('.approve-btn').addEventListener('click', async () => {
                try {
                    await apiReviewApplication(app._id, 'approved', adminUsername, null);
                    div.remove();
                    _loadExpertSection();
                } catch (err) { alert('Error: ' + err.message); }
            });

            div.querySelector('.reject-btn').addEventListener('click', async () => {
                const reason = prompt('Reason for rejection (optional):');
                try {
                    await apiReviewApplication(app._id, 'rejected', adminUsername, reason || null);
                    div.remove();
                } catch (err) { alert('Error: ' + err.message); }
            });

            listEl.appendChild(div);
        });
    } catch (err) {
        console.error('[dashboard] Admin section error:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    _loadStats();
    _loadNotifications();
    _loadProfileSection();
    _loadExpertSection();
    document.getElementById('scope-select').addEventListener('change', _loadStats);
});
