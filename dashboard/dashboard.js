// ─────────────────────────────────────────────
// dashboard.js
// Standalone dashboard page — fetches trending
// category stats and renders simple CSS bar charts.
// Depends on: api.js, config/config.js
// ─────────────────────────────────────────────

const CATEGORY_COLORS = {
    'Statistics & Data':      { bg: 'rgba(101, 31, 255, 0.15)', color: '#651fff' },
    'Quote / Misattribution': { bg: 'rgba(255, 109, 0, 0.15)',  color: '#e65100' },
    'Historical Claim':       { bg: 'rgba(0, 137, 123, 0.15)',  color: '#00897b' },
    'Scientific Claim':       { bg: 'rgba(6, 95, 212, 0.15)',   color: '#065fd4' },
    'Context / Methodology':  { bg: 'rgba(194, 24, 91, 0.15)',  color: '#c2185b' },
    'Other':                  { bg: 'rgba(0, 0, 0, 0.1)',       color: '#606060' },
    'Uncategorized':          { bg: 'rgba(0, 0, 0, 0.07)',      color: '#9e9e9e' },
};

function _categoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['Uncategorized'];
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
        console.error('[dashboard] Error loading stats:', err);
        document.getElementById('dashboard-content').innerHTML =
            `<p class="error-message">Error loading dashboard stats: ${err.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    _loadStats();
    document.getElementById('scope-select').addEventListener('change', _loadStats);
});
