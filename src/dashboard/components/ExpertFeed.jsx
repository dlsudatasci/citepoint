import React, { useState, useEffect, useContext } from 'react';
import FeedCard from './FeedCard';
import { UserContext } from '../context/UserContext';

export default function ExpertFeed() {
    const { user } = useContext(UserContext);
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!user.username) {
            setLoading(false);
            return;
        }
        let isMounted = true;
        setLoading(true);
        setError(null);

        window.apiGetExpertFeed(user.username)
            .then(data => { if (isMounted) { setFeed(data || []); setLoading(false); } })
            .catch(err => { if (isMounted) { setError(err.message); setLoading(false); } });

        return () => { isMounted = false; };
    }, [user.username]);

    if (!user.username) {
        return <p className="empty-message">Log in to YouTube to view your expert feed.</p>;
    }

    return (
        <section className="dashboard-section" style={{ border: 'none', background: 'transparent', padding: 0 }}>
            <h2 style={{ fontSize: '20px', margin: '0 0 16px 0' }}>Expert Feed</h2>
            <p className="dashboard-subtitle">Requests matching the topics you're verified in.</p>

            {loading && <p className="empty-message">Loading feed...</p>}
            {error && <p className="error-message">Error: {error}</p>}

            {!loading && !error && feed.length === 0 && (
                <p className="empty-message">No requests found for your topics.</p>
            )}

            {!loading && !error && feed.length > 0 && (
                <div className="feed-list">
                    {feed.map(item => (
                        <FeedCard key={item._id || item.id} item={item} />
                    ))}
                </div>
            )}
        </section>
    );
}
