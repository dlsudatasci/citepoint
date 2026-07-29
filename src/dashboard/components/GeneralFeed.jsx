import React, { useState, useEffect, useCallback } from 'react';
import FeedCard from './FeedCard';

export default function GeneralFeed() {
    const [feed, setFeed] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedTopic, setSelectedTopic] = useState('All');

    const topicsList = window.TOPICS || [];

    const load = useCallback(async (pageToLoad, append) => {
        setLoading(true);
        setError(null);
        try {
            const res = await window.apiGetGeneralFeed(selectedTopic, pageToLoad, 20);
            setFeed(prev => append ? [...prev, ...(res.feed || [])] : (res.feed || []));
            setPagination(res.pagination);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedTopic]);

    useEffect(() => {
        setPage(1);
        load(1, false);
    }, [load]);

    function loadMore() {
        const next = page + 1;
        setPage(next);
        load(next, true);
    }

    return (
        <section className="dashboard-section" style={{ border: 'none', background: 'transparent', padding: 0 }}>
            <div className="feed-header">
                <h2 style={{ fontSize: '20px', margin: 0 }}>General Citation Requests</h2>
                <select 
                    className="feed-filter-select"
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                >
                    <option value="All">All Topics</option>
                    {topicsList.map(topic => (
                        <option key={topic} value={topic}>{topic}</option>
                    ))}
                </select>
            </div>

            {loading && feed.length === 0 && <p className="empty-message">Loading feed...</p>}
            {error && <p className="error-message">Error: {error}</p>}

            {!loading && !error && feed.length === 0 && (
                <p className="empty-message">No requests found for this topic.</p>
            )}

            {feed.length > 0 && (
                <div className="feed-list">
                    {feed.map(item => (
                        <FeedCard key={item._id || item.id} item={item} />
                    ))}
                </div>
            )}

            {pagination && page < pagination.pages && (
                <button className="cp-btn cp-btn--secondary load-more-btn" onClick={loadMore} disabled={loading}>
                    {loading ? 'Loading...' : 'Load more'}
                </button>
            )}
        </section>
    );
}