import React, { useState, useEffect, useCallback, useContext } from 'react';
import { UserContext } from '../context/UserContext';

// window.categoryColor / window.CATEGORY_COLORS come from config/config.js, loaded
// as a plain script in dashboard.html before this bundle — single source of truth
// shared with content/citations.js instead of each keeping its own copy.
function categoryColor(category) {
    return window.categoryColor(category);
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

function StatsPanel({ stats }) {
    return (
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
    );
}

export default function Analytics() {
    const { user } = useContext(UserContext);
    const [scope, setScope] = useState('video');
    const [myStats, setMyStats] = useState(null);
    const [allStats, setAllStats] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
        setError(null);
        setLoading(true);
        try {
            const videoId = scope === 'video' ? await getActiveVideoId() : null;
            if (user.isAdmin) {
                const [mine, all] = await Promise.all([
                    window.apiGetDashboardStats(videoId, user.username || null),
                    window.apiGetDashboardStats(videoId, null),
                ]);
                setMyStats(mine);
                setAllStats(all);
            } else {
                const result = await window.apiGetDashboardStats(videoId, user.username || null);
                setMyStats(result);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [scope, user.username, user.isAdmin]);

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

            {loading && !error && (
                <div className="cp-loading">
                    <div className="cp-skeleton"></div>
                    <div className="cp-skeleton"></div>
                    <div className="cp-skeleton"></div>
                </div>
            )}

            {!loading && myStats && (
                <>
                    {user.isAdmin && <h2 className="analytics-group-title">My Analytics</h2>}
                    <StatsPanel stats={myStats} />

                    {user.isAdmin && allStats && (
                        <>
                            <h2 className="analytics-group-title">All Users</h2>
                            <StatsPanel stats={allStats} />
                        </>
                    )}
                </>
            )}
        </div>
    );
}
