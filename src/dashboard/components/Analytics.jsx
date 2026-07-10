import React, { useState, useEffect, useCallback } from 'react';

const CATEGORY_COLORS = {
    'Statistics & Data':      { bg: 'rgba(101, 31, 255, 0.12)', color: '#651fff' },
    'Quote / Misattribution': { bg: 'rgba(230, 81, 0, 0.12)',   color: '#e65100' },
    'Historical Claim':       { bg: 'rgba(0, 137, 123, 0.12)',  color: '#00897b' },
    'Scientific Claim':       { bg: 'rgba(6, 95, 212, 0.12)',   color: '#065fd4' },
    'Context / Methodology':  { bg: 'rgba(194, 24, 91, 0.12)',  color: '#c2185b' },
    'Other':                  { bg: 'rgba(0, 0, 0, 0.07)',      color: '#606060' },
    'Uncategorized':          { bg: 'rgba(0, 0, 0, 0.05)',      color: '#9e9e9e' },
};

function categoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['Uncategorized'];
}

function getActiveVideoId() {
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

function BarChart({ data }) {
    if (!data || data.length === 0) {
        return <p className="empty-message">No data available.</p>;
    }
    const max = Math.max(...data.map(d => d.count), 1);
    return (
        <>
            {data.map(({ category, count }) => {
                const colors = categoryColor(category);
                return (
                    <div className="bar-row" key={category}>
                        <span className="bar-label">{category}</span>
                        <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${(count / max) * 100}%`, backgroundColor: colors.color }} />
                        </div>
                        <span className="bar-count">{count}</span>
                    </div>
                );
            })}
        </>
    );
}

function StackedChart({ data }) {
    if (!data || data.length === 0) {
        return <p className="empty-message">No data available.</p>;
    }
    const max = Math.max(...data.map(d => d.verified + d.unverified), 1);
    return (
        <>
            {data.map(({ category, verified, unverified }) => {
                const total = verified + unverified;
                return (
                    <div className="bar-row" key={category}>
                        <span className="bar-label">{category}</span>
                        <div className="bar-track">
                            <div className="bar-fill bar-fill-verified" style={{ width: `${(verified / max) * 100}%` }} />
                            <div className="bar-fill bar-fill-unverified" style={{ width: `${(unverified / max) * 100}%` }} />
                        </div>
                        <span className="bar-count">{verified} / {total}</span>
                    </div>
                );
            })}
        </>
    );
}

export default function Analytics() {
    const [scope, setScope] = useState('video');
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    const loadStats = useCallback(async () => {
        setError(null);
        try {
            const videoId = scope === 'video' ? await getActiveVideoId() : null;
            const result = await window.apiGetDashboardStats(videoId);
            setStats(result);
        } catch (err) {
            setError(err.message);
        }
    }, [scope]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    return (
        <div>
            <div className="dashboard-scope">
                <label htmlFor="scope-select">Scope:</label>
                <select id="scope-select" value={scope} onChange={e => setScope(e.target.value)}>
                    <option value="video">This video</option>
                    <option value="global">All videos</option>
                </select>
            </div>

            {error && <p className="error-message">Error loading dashboard stats: {error}</p>}

            {stats && (
                <>
                    <section className="dashboard-section">
                        <h2>Trending Requested Categories</h2>
                        <div className="bar-chart"><BarChart data={stats.requestsByCategory} /></div>
                    </section>

                    <section className="dashboard-section">
                        <h2>Citations by Category</h2>
                        <div className="bar-chart"><BarChart data={stats.citationsByCategory} /></div>
                    </section>

                    <section className="dashboard-section">
                        <h2>Expert Verification Activity</h2>
                        <div className="verification-group">
                            <h3>Citations</h3>
                            <div className="stacked-chart"><StackedChart data={stats.verificationStats.citations} /></div>
                        </div>
                        <div className="verification-group">
                            <h3>Citation Requests</h3>
                            <div className="stacked-chart"><StackedChart data={stats.verificationStats.requests} /></div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
