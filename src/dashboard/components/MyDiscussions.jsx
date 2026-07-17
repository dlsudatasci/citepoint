import React, { useState, useEffect, useContext, useCallback } from 'react';
import { UserContext } from '../context/UserContext';
import DiscussionCard from './DiscussionCard';
import '../styles/discussion.css';

const FILTERS = [
    { key: 'all',         label: 'All' },
    { key: 'mine',        label: 'My Citations' },
    { key: 'requests',    label: 'My Requests' },
    { key: 'participated', label: 'Participated' },
    { key: 'unread',      label: 'Unread' },
];

const SEARCH_DEBOUNCE_MS = 400;

export default function MyDiscussions({ onOpenDiscussion }) {
    const { user } = useContext(UserContext);
    const [filter, setFilter] = useState('all');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [discussions, setDiscussions] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Debounce the search box so we don't fire a request per keystroke.
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [searchInput]);

    const load = useCallback(async (pageToLoad, append) => {
        if (!user.username) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await window.apiGetMyDiscussions(user.username, filter, pageToLoad, search);
            setDiscussions(prev => append ? [...prev, ...res.discussions] : res.discussions);
            setPagination(res.pagination);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [user.username, filter, search]);

    useEffect(() => {
        setPage(1);
        load(1, false);
    }, [load]);

    function loadMore() {
        const next = page + 1;
        setPage(next);
        load(next, true);
    }

    if (!user.username) {
        return <p className="empty-message">Log in to YouTube to see your discussions.</p>;
    }

    return (
        <section className="dashboard-section" style={{ border: 'none', background: 'transparent', padding: 0 }}>
            <div className="feed-header">
                <h2 style={{ fontSize: '20px', margin: 0 }}>My Discussions</h2>
            </div>

            <div className="discussions-toolbar">
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        className={`discussions-filter-pill ${filter === f.key ? 'active' : ''}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
                <input
                    type="search"
                    className="discussions-search-input"
                    placeholder="Search discussions..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    aria-label="Search my discussions"
                />
            </div>

            {loading && discussions.length === 0 && <p className="empty-message">Loading discussions...</p>}
            {error && <p className="error-message">Error: {error}</p>}
            {!loading && !error && discussions.length === 0 && (
                <p className="empty-message">No discussions found.</p>
            )}

            {discussions.length > 0 && (
                <div className="feed-list">
                    {discussions.map(item => (
                        <DiscussionCard
                            key={`${item.rootType}:${item.rootId}`}
                            item={item}
                            onOpenDiscussion={onOpenDiscussion}
                        />
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
