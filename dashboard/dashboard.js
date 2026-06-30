// ─────────────────────────────────────────────
// dashboard.js
// Standalone dashboard page — rendering charts, 
// community feeds, and expert verification.
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

function _initTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Lazy load feeds when their tab is clicked
            if (targetId === 'general-feed-section') _loadGeneralFeed();
            if (targetId === 'expert-feed-section') _loadExpertFeed();
        });
    });
}

function _populateTaxonomyUI() {
    // Populate General Feed Category Filter
    const filterSelect = document.getElementById('general-feed-filter');
    if (typeof CATEGORIES !== 'undefined') {
        CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            filterSelect.appendChild(opt);
        });
    }

    // Populate Expert Application Topic Checkboxes
    const topicContainer = document.getElementById('expert-topics-container');
    if (typeof TOPICS !== 'undefined') {
        topicContainer.innerHTML = TOPICS.map(topic => `
            <label class="topic-checkbox-label">
                <input type="checkbox" name="expert-topics" value="${topic}">
                ${topic}
            </label>
        `).join('');
    }
}

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

// ── Chart Rendering ──────────────────────────

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
            <span class="bar-label">${category}</span>
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
            <span class="bar-label">${category}</span>
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
        document.getElementById('dashboard-content').innerHTML =
            `<p class="error-message">Error loading dashboard stats: ${err.message}</p>`;
    }
}

// ── Feeds Rendering ──────────────────────────

function _parseTimeString(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').reverse();
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
        seconds += parseInt(parts[i], 10) * Math.pow(60, i);
    }
    return seconds;
}

function _renderFeedCards(container, items) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="empty-message">No requests found.</p>';
        return;
    }

    items.forEach(item => {
        const catColor = _categoryColor(item.category);
        const videoTitle = item.video?.title || 'Unknown Video';
        const thumbUrl = item.video?.thumbnailUrl || 'https://via.placeholder.com/160x90?text=No+Video';
        const videoId = item.video?.videoId || '';
        const topicsHtml = (item.topics || []).map(t => `<span class="feed-topic-tag">${t}</span>`).join('');
        const startSecs = _parseTimeString(item.timestampStart);
        
        const card = document.createElement('div');
        card.className = 'feed-card';
        card.innerHTML = `
            <div class="feed-thumb-container">
                <a href="https://youtube.com/watch?v=${videoId}&t=${startSecs}s" target="_blank">
                    <img src="${thumbUrl}" alt="Video Thumbnail" class="feed-thumbnail">
                </a>
            </div>
            <div class="feed-card-content">
                <h3 class="feed-item-title">${item.title}</h3>
                <div class="feed-video-title">${videoTitle}</div>
                <div class="feed-meta-row">
                    <span class="feed-category-badge" style="background:${catColor.bg};color:${catColor.color}">${item.category}</span>
                    <span class="feed-topics-list">${topicsHtml}</span>
                </div>
                <div class="feed-footer">
                    <span class="feed-score">▲ ${item.voteScore || 0}</span>
                    <span class="feed-date">${new Date(item.dateAdded).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="feed-card-actions">
                <a class="submit-btn feed-go-btn" href="https://youtube.com/watch?v=${videoId}&t=${startSecs}s" target="_blank">View Video</a>
            </div>
        `;
        container.appendChild(card);
    });
}

async function _loadGeneralFeed() {
    const listEl = document.getElementById('general-feed-list');
    const category = document.getElementById('general-feed-filter').value;
    listEl.innerHTML = '<p class="empty-message">Loading...</p>';
    
    try {
        const res = await apiGetGeneralFeed(category, 1, 20);
        _renderFeedCards(listEl, res.feed);
    } catch (err) {
        listEl.innerHTML = `<p class="error-message">Could not load feed: ${err.message}</p>`;
    }
}

async function _loadExpertFeed() {
    const username = await _getUsername();
    const listEl = document.getElementById('expert-feed-list');
    if (!username) {
        listEl.innerHTML = '<p class="empty-message">Log in to view your expert feed.</p>';
        return;
    }
    listEl.innerHTML = '<p class="empty-message">Loading...</p>';

    try {
        const feed = await apiGetExpertFeed(username);
        _renderFeedCards(listEl, feed);
    } catch (err) {
        listEl.innerHTML = `<p class="error-message">Could not load expert feed: ${err.message}</p>`;
    }
}

document.getElementById('general-feed-filter').addEventListener('change', _loadGeneralFeed);


// ── Notifications, Profile & Expert ──────────

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
                    <span class="notif-title">${n.title}</span>
                    ${n.category ? `<span class="notif-category">${n.category}</span>` : ''}
                    <span class="notif-time">${new Date(n.createdAt).toLocaleDateString()}</span>
                </div>
            `;
            if (!n.read) {
                div.addEventListener('click', async () => {
                    await apiMarkNotificationRead(n._id);
                    div.classList.remove('unread');
                });
            }
            listEl.appendChild(div);
        });
    } catch (err) {
        listEl.innerHTML = '<p class="error-message">Could not load notifications.</p>';
    }
}

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

        // Render Topics if expert, fallback to categories to prevent errors on older data
        const expertString = expert ? (expert.expertTopics?.join(', ') || expert.categories?.join(', ')) : '';

        statsEl.innerHTML = `
            <div class="stat-card"><span class="stat-number">${stats.citations}</span><span class="stat-label">Citations</span></div>
            <div class="stat-card"><span class="stat-number">${stats.requests}</span><span class="stat-label">Requests</span></div>
            <div class="stat-card"><span class="stat-number">${stats.upvotes}</span><span class="stat-label">Upvotes</span></div>
            ${expert ? `<div class="stat-card stat-expert"><span class="stat-number">✓</span><span class="stat-label">Expert: ${expertString}</span></div>` : ''}
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
                    <span class="history-title">${item.title || 'Untitled'}</span>
                    <span class="history-score">▲ ${item.score ?? 0}</span>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                `;
                histEl.appendChild(div);
            });
        }
    } catch (err) {
        statsEl.innerHTML = '<p class="error-message">Could not load profile.</p>';
    }
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
        const res = await apiCheckExpert(username); // Using the updated function from api.js
        if (res.isExpert) {
            const topicsStr = res.expertTopics && res.expertTopics.length > 0
                ? res.expertTopics.join(', ')
                : 'No topics assigned';
            statusEl.innerHTML = `<div class="expert-badge-banner"><span class="expert-check">✓</span> Verified Expert — ${topicsStr}</div>`;
            
            // Show the Expert Feed nav button
            document.getElementById('nav-expert-feed').style.display = 'block';
            _loadAdminSection(username);
        } else {
            statusEl.innerHTML = '<p>You are not yet a verified expert.</p>';
            formEl.style.display = 'block';
        }

        const apps = await apiGetMyApplications(username);
        if (apps.length > 0) {
            listEl.innerHTML = '<h3>Your Applications</h3>';
            apps.forEach(app => {
                const statusClass = app.status === 'approved' ? 'status-approved' : app.status === 'rejected' ? 'status-rejected' : 'status-pending';
                // Support both legacy category or new topics arrays
                const domain = app.topics ? app.topics.join(', ') : app.category; 
                
                const div = document.createElement('div');
                div.className = 'application-card';
                div.innerHTML = `
                    <div class="app-header">
                        <span class="app-category">${domain}</span>
                        <span class="app-status ${statusClass}">${app.status}</span>
                    </div>
                    <p class="app-credentials">${app.credentials}</p>
                    ${app.reason ? `<p class="app-reason">Reason: ${app.reason}</p>` : ''}
                    <span class="app-date">Submitted ${new Date(app.submittedAt).toLocaleDateString()}</span>
                `;
                listEl.appendChild(div);
            });
        }

        const form = document.getElementById('expert-application-form');
        form?.addEventListener('submit', async e => {
            e.preventDefault();
            
            // Gather all checked topics
            const checkboxes = document.querySelectorAll('input[name="expert-topics"]:checked');
            const selectedTopics = Array.from(checkboxes).map(cb => cb.value);
            const credentials = document.getElementById('expert-credentials').value.trim();
            
            if (selectedTopics.length === 0) {
                alert('Please select at least one topic.');
                return;
            }

            try {
                await apiApplyExpert(username, selectedTopics, credentials);
                form.reset();
                formEl.innerHTML = '<p class="success-message">Application submitted! You will be notified when reviewed.</p>';
                _loadExpertSection();
            } catch (err) {
                alert('Error: ' + (err.message || 'Failed to submit application'));
            }
        });

    } catch (err) {
        statusEl.innerHTML = '<p class="error-message">Could not load expert status.</p>';
    }
}

async function _loadAdminSection(adminUsername) {
    const section = document.getElementById('admin-section');
    const listEl  = document.getElementById('admin-pending-list');
    document.getElementById('nav-admin').style.display = 'block';

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
            const domain = app.topics ? app.topics.join(', ') : app.category;
            
            div.innerHTML = `
                <div class="app-header">
                    <span class="app-username">${app.username}</span>
                    <span class="app-category">${domain}</span>
                </div>
                <p class="app-credentials">${app.credentials}</p>
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
    _initTabs();
    _populateTaxonomyUI();
    _loadStats();
    _loadNotifications();
    _loadProfileSection();
    _loadExpertSection();
    document.getElementById('scope-select').addEventListener('change', _loadStats);
});