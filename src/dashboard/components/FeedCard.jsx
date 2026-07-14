import React from 'react';

const TOPIC_COLORS = {
    'Science & Technology': { bg: 'rgba(6, 95, 212, 0.12)',   color: '#065fd4' }, // Blue
    'History':              { bg: 'rgba(230, 81, 0, 0.12)',   color: '#e65100' }, // Orange
    'Politics & News':      { bg: 'rgba(194, 24, 91, 0.12)',  color: '#c2185b' }, // Pink/Red
    'Education':            { bg: 'rgba(0, 137, 123, 0.12)',  color: '#00897b' }, // Teal
    'Health & Fitness':     { bg: 'rgba(46, 204, 113, 0.12)', color: '#27ae60' }, // Green
    'Economics':            { bg: 'rgba(101, 31, 255, 0.12)', color: '#651fff' }, // Purple
    'Philosophy':           { bg: 'rgba(142, 68, 173, 0.12)', color: '#8e44ad' }, // Deep Purple
    'Entertainment':        { bg: 'rgba(241, 196, 15, 0.12)', color: '#f39c12' }, // Yellow/Gold
    'Other':                { bg: 'rgba(0, 0, 0, 0.05)',      color: '#606060' }
};

function parseTimeString(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').reverse();
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
        seconds += parseInt(parts[i], 10) * Math.pow(60, i);
    }
    return seconds;
}

export default function FeedCard({ item }) {
    const videoTitle = item.video?.title || 'Unknown Video';
    const thumbUrl = item.video?.thumbnailUrl || 'https://via.placeholder.com/160x90?text=No+Video';
    const videoId = item.video?.videoId || '';
    const startSecs = parseTimeString(item.timestampStart);
    const videoUrl = `https://youtube.com/watch?v=${videoId}&t=${startSecs}s`;

    const topics = item.topics && item.topics.length > 0 ? item.topics : ['Other'];

    return (
        <div className="feed-card">
            <div className="feed-thumb-container">
                <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                    <img src={thumbUrl} alt="Video Thumbnail" className="feed-thumbnail" />
                </a>
            </div>
            
            <div className="feed-card-content">
                <h3 className="feed-item-title">{item.title}</h3>
                <div className="feed-video-title">{videoTitle}</div>
                
                <div className="feed-meta-row">
                    {/* primary: Topic */}
                    {topics.map((topic, idx) => {
                        const colors = TOPIC_COLORS[topic] || TOPIC_COLORS['Other'];
                        return (
                            <span 
                                key={idx} 
                                className="feed-category-badge" 
                                style={{ background: colors.bg, color: colors.color, marginRight: '6px' }}
                            >
                                {topic}
                            </span>
                        );
                    })}
                    
                    {/* secondary: grey Category tag */}
                    <span className="feed-topic-tag" style={{ marginLeft: 'auto' }}>
                        {item.category}
                    </span>
                </div>
                
                <div className="feed-footer">
                    <span className="feed-score">▲ {item.voteScore || 0}</span>
                    <span className="feed-date">{new Date(item.dateAdded).toLocaleDateString()}</span>
                </div>
            </div>
            
            <div className="feed-card-actions">
                <a className="submit-btn feed-go-btn cp-btn cp-btn--primary" href={videoUrl} target="_blank" rel="noopener noreferrer">
                    View Video
                </a>
            </div>
        </div>
    );
}