import React, { useState, useEffect } from 'react';
import FeedCard from './FeedCard';

export default function GeneralFeed() {
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedTopic, setSelectedTopic] = useState('All');

    const topicsList = window.TOPICS || []; 

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const fetchFeed = async () => {
            try {
                const res = await window.apiGetGeneralFeed(selectedTopic, 1, 20);
                if (isMounted) {
                    setFeed(res.feed || []);
                    setLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message);
                    setLoading(false);
                }
            }
        };

        fetchFeed();

        return () => { isMounted = false; };
    }, [selectedTopic]);

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

            {loading && <p className="empty-message">Loading feed...</p>}
            {error && <p className="error-message">Error: {error}</p>}
            
            {!loading && !error && feed.length === 0 && (
                <p className="empty-message">No requests found for this topic.</p>
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