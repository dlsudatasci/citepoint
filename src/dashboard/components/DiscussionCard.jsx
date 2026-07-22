import React from 'react';

function parseTimeString(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').reverse();
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
        seconds += parseInt(parts[i], 10) * Math.pow(60, i);
    }
    return seconds;
}

export default function DiscussionCard({ item, onOpenDiscussion }) {
    const videoTitle = item.video?.title || 'Unknown Video';
    const thumbUrl   = item.video?.thumbnailUrl || 'https://via.placeholder.com/160x90?text=No+Video';
    const videoId    = item.video?.videoId || item.videoId || '';
    const startSecs  = parseTimeString(item.timestampStart);
    const videoUrl   = `https://youtube.com/watch?v=${videoId}&t=${startSecs}s`;

    return (
        <div className="discussion-card">
            {/* alt="" — the video title is already shown as visible text below (line ~31);
                a real alt here would just make screen readers announce it twice. */}
            <img src={thumbUrl} alt="" className="discussion-card__thumb" />

            <div className="discussion-card__body">
                <div className="discussion-card__title-row">
                    {item.unreadCount > 0 && <span className="discussion-card__unread-dot" aria-hidden="true" />}
                    <h3 className="discussion-card__title">
                        {item.rootType === 'request' ? 'Request: ' : ''}{item.title || 'Untitled'}
                    </h3>
                </div>
                <div className="discussion-card__video-title">{videoTitle}</div>

                <p className="discussion-card__last-reply">
                    {item.lastReply
                        ? <><strong>{item.lastReply.username || 'Anonymous'}:</strong> {item.lastReply.description}</>
                        : 'No replies yet.'}
                </p>

                <div className="discussion-card__meta-row">
                    <span>{item.replyCount} {item.replyCount === 1 ? 'reply' : 'replies'}</span>
                    <span aria-label={`${item.voteScore || 0} votes`}><span aria-hidden="true">▲ {item.voteScore || 0}</span></span>
                    <span>{new Date(item.lastActivity).toLocaleDateString()}</span>
                    {item.unreadCount > 0 && (
                        <span className="discussion-card__unread-badge">{item.unreadCount} new</span>
                    )}
                </div>
            </div>

            <div className="discussion-card__actions">
                <button
                    className="cp-btn cp-btn--primary"
                    onClick={() => onOpenDiscussion(item.rootType, item.rootId)}
                >
                    Open Discussion
                </button>
                <a className="cp-btn cp-btn--secondary" href={videoUrl} target="_blank" rel="noopener noreferrer">
                    Open Video
                </a>
            </div>
        </div>
    );
}
