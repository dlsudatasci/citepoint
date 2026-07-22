import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { UserContext } from '../context/UserContext';
import '../styles/discussion.css';

const MAX_VISUAL_DEPTH = 5;

// ── Helpers (ported from discussion/discussion.js) ──────────

function safeUrl(str) {
    if (typeof str !== 'string' || !str) return null;
    try {
        const parsed = new URL(str);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? str : null;
    } catch {
        return null;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function timestampToSeconds(ts) {
    if (!ts) return 0;
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function countAllReplies(items) {
    let count = 0;
    for (const item of items) {
        count++;
        if (item.children) count += countAllReplies(item.children);
    }
    return count;
}

function sortItems(items, sortMode) {
    const sorted = [...items];
    if (sortMode === 'top') {
        sorted.sort((a, b) => {
            const av = a.categoryVerified ? 1 : 0, bv = b.categoryVerified ? 1 : 0;
            if (bv !== av) return bv - av;
            return (b.voteScore ?? 0) - (a.voteScore ?? 0);
        });
    } else if (sortMode === 'new') {
        sorted.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    } else {
        sorted.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
    }
    return sorted;
}

function updateScoreRecursive(items, itemId, newScore) {
    return items.map(item => {
        const key = item.id || item._id;
        if (key === itemId) return { ...item, voteScore: newScore };
        if (item.children) return { ...item, children: updateScoreRecursive(item.children, itemId, newScore) };
        return item;
    });
}

// ── Vote controls (shared by original-item cards and thread nodes) ──

function VoteControls({ itemId, itemType, score, vote, onVote }) {
    return (
        <div className="vote-controls">
            <button
                className={`vote-btn upvote-btn ${vote === 'up' ? 'voted' : ''}`}
                aria-pressed={vote === 'up'}
                aria-label={vote === 'up' ? 'Remove upvote' : 'Upvote'}
                onClick={() => onVote(itemId, 'up', itemType)}
            >▲</button>
            <span className="vote-score">{score ?? 0}</span>
            <button
                className={`vote-btn downvote-btn ${vote === 'down' ? 'voted' : ''}`}
                aria-pressed={vote === 'down'}
                aria-label={vote === 'down' ? 'Remove downvote' : 'Downvote'}
                onClick={() => onVote(itemId, 'down', itemType)}
            >▼</button>
        </div>
    );
}

// ── Original item cards ──────────────────────────────────────

// Shown on the original citation/request card when the current user owns it or is
// an expert — the only two roles allowed to change resolved status server-side.
function ResolvedControl({ resolved, canResolve, onToggleResolved }) {
    if (!resolved && !canResolve) return null;
    return (
        <div className="original-resolved-row">
            {resolved && <span className="resolved-badge">✓ Resolved</span>}
            {canResolve && (
                <button className="cp-btn cp-btn--secondary resolve-toggle-btn" onClick={onToggleResolved}>
                    {resolved ? 'Mark unresolved' : 'Mark resolved'}
                </button>
            )}
        </div>
    );
}

function OriginalCitationCard({ citation, userVotes, onVote, canResolve, onToggleResolved }) {
    const itemId = citation.id || citation._id;
    return (
        <div className="original-card">
            <h2 className="original-title">{citation.citationTitle || 'Untitled'}</h2>
            <div className="original-meta">
                <span className="original-timestamp">{citation.timestampStart} → {citation.timestampEnd}</span>
                <span className="original-author">{citation.username || 'Anonymous'}</span>
                <span className="original-date">{formatDate(citation.dateAdded)}</span>
            </div>
            {citation.category && <span className="original-category">{citation.category}</span>}
            {citation.description && <p className="original-description">{citation.description}</p>}
            {safeUrl(citation.source) && (
                <a className="original-source" href={safeUrl(citation.source)} target="_blank" rel="noopener noreferrer">Source ↗</a>
            )}
            <ResolvedControl resolved={citation.resolved} canResolve={canResolve} onToggleResolved={onToggleResolved} />
            <VoteControls itemId={itemId} itemType="citation" score={citation.voteScore} vote={userVotes[itemId]} onVote={onVote} />
            {citation.videoId && (
                <a
                    className="video-link"
                    href={`https://www.youtube.com/watch?v=${citation.videoId}&t=${timestampToSeconds(citation.timestampStart)}`}
                    target="_blank" rel="noopener noreferrer"
                >Watch on YouTube ↗</a>
            )}
        </div>
    );
}

function OriginalRequestCard({ request, userVotes, onVote, canResolve, onToggleResolved }) {
    const itemId = request.id || request._id;
    return (
        <div className="original-card original-request">
            <span className="request-label">Citation Request</span>
            <h2 className="original-title">{request.title || 'Untitled Request'}</h2>
            <div className="original-meta">
                <span className="original-timestamp">{request.timestampStart} → {request.timestampEnd}</span>
                <span className="original-author">{request.username || 'Anonymous'}</span>
                <span className="original-date">{formatDate(request.dateAdded)}</span>
            </div>
            {request.category && <span className="original-category">{request.category}</span>}
            {request.reason && <p className="original-description">{request.reason}</p>}
            <ResolvedControl resolved={request.resolved} canResolve={canResolve} onToggleResolved={onToggleResolved} />
            <VoteControls itemId={itemId} itemType="request" score={request.voteScore} vote={userVotes[itemId]} onVote={onVote} />
            {request.videoId && (
                <a
                    className="video-link"
                    href={`https://www.youtube.com/watch?v=${request.videoId}&t=${timestampToSeconds(request.timestampStart)}`}
                    target="_blank" rel="noopener noreferrer"
                >Watch on YouTube ↗</a>
            )}
        </div>
    );
}

// ── Inline reply form ─────────────────────────────────────────

function ReplyForm({ onCancel, onSubmit }) {
    const [text, setText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const textareaRef = useRef(null);

    useEffect(() => { textareaRef.current?.focus(); }, []);

    async function handleSubmit() {
        const trimmed = text.trim();
        if (!trimmed) return;
        setSubmitting(true);
        setError(null);
        try {
            await onSubmit(trimmed);
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    }

    return (
        <div className="thread-reply-form">
            <textarea
                ref={textareaRef}
                rows={3}
                placeholder="Write a reply..."
                value={text}
                onChange={e => setText(e.target.value)}
                aria-label="Reply text"
            />
            {error && <p className="error-message">{error}</p>}
            <div className="thread-reply-actions">
                <button className="reply-submit-btn cp-btn cp-btn--primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Sending...' : 'Reply'}
                </button>
                <button className="reply-cancel-btn cp-btn cp-btn--secondary" onClick={onCancel} disabled={submitting}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Thread node (recursive; also used for flat request-response items) ──

function ThreadNode({ item, depth, currentUser, userVotes, onVote, onReply, onDelete, onContinueThread }) {
    const [collapsed, setCollapsed] = useState(false);
    const [showReplyForm, setShowReplyForm] = useState(false);

    const itemId  = item.id || item._id;
    const isOwner = currentUser && item.username === currentUser;
    const hasKids = item.children && item.children.length > 0;
    const childCount = hasKids ? countAllReplies(item.children) : 0;

    const desc = item.description?.startsWith('Response to request:')
        ? item.description.split('\n\n').slice(1).join('\n\n').trim()
        : item.description;

    return (
        <div className={`thread-node ${depth > 0 ? 'thread-node--nested' : ''}`}>
            <div className="thread-item">
                <div className="thread-item-header">
                    {hasKids && (
                        <button
                            className="thread-collapse-btn"
                            onClick={() => setCollapsed(c => !c)}
                            aria-expanded={!collapsed}
                            aria-label={collapsed ? `Expand ${childCount} ${childCount === 1 ? 'reply' : 'replies'}` : 'Collapse replies'}
                        >
                            [{collapsed ? '+' : '−'}]
                        </button>
                    )}
                    <span className="thread-author">{item.username || 'Anonymous'}</span>
                    {item.categoryVerified && <span className="expert-badge">Expert</span>}
                    <span className="thread-date">{formatDate(item.dateAdded)}</span>
                </div>
                <div className={`thread-item-body ${collapsed ? 'thread-collapsed' : ''}`}>
                    <p className="thread-description">{desc}</p>
                    {safeUrl(item.source) && (
                        <a className="thread-source" href={safeUrl(item.source)} target="_blank" rel="noopener noreferrer">Source ↗</a>
                    )}
                    <div className="thread-item-actions">
                        <VoteControls itemId={itemId} itemType="citation" score={item.voteScore} vote={userVotes[itemId]} onVote={onVote} />
                        {!isOwner && (
                            <button className="thread-reply-btn" onClick={() => setShowReplyForm(s => !s)}>Reply</button>
                        )}
                        {isOwner && (
                            <button className="thread-delete-btn" onClick={() => onDelete(item)}>Delete</button>
                        )}
                    </div>
                </div>
                {showReplyForm && (
                    <ReplyForm
                        onCancel={() => setShowReplyForm(false)}
                        onSubmit={async (text) => { await onReply(item, text); setShowReplyForm(false); }}
                    />
                )}
            </div>

            {hasKids && (
                depth >= MAX_VISUAL_DEPTH ? (
                    <button className="thread-continue-link" onClick={() => onContinueThread(itemId)}>
                        Continue this thread ({childCount} more) →
                    </button>
                ) : (
                    <div className={`thread-children ${collapsed ? 'thread-collapsed' : ''}`}>
                        {item.children.map(child => (
                            <ThreadNode
                                key={child.id || child._id}
                                item={child}
                                depth={depth + 1}
                                currentUser={currentUser}
                                userVotes={userVotes}
                                onVote={onVote}
                                onReply={onReply}
                                onDelete={onDelete}
                                onContinueThread={onContinueThread}
                            />
                        ))}
                    </div>
                )
            )}
        </div>
    );
}

// ── Top-level thread view ─────────────────────────────────────

/**
 * @param {'citation'|'request'} type
 * @param {string} id  — root citation or request id
 * @param {(rootType, rootId) => void} onOpenDiscussion  — re-root the view (e.g. "continue thread")
 * @param {() => void} [onBack]  — back to My Discussions, omitted when opened standalone
 */
export default function DiscussionThread({ type, id, onOpenDiscussion, onBack }) {
    const { user } = useContext(UserContext);
    const currentUser = user.username;

    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [original, setOriginal] = useState(null);
    const [tree, setTree]         = useState([]);
    const [flatList, setFlatList] = useState([]);
    const [sort, setSort]         = useState('top');
    const [userVotes, setUserVotes] = useState({});

    const videoId = original?.videoId || null;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (type === 'citation') {
                const res = await window.apiGetDiscussionTree(id);
                setOriginal(res.citation);
                setTree(res.replies || []);
            } else {
                const res = await window.apiGetDiscussionRequest(id);
                setOriginal(res.request);
                setFlatList(res.responses || []);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [type, id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!videoId) return;
        (async () => {
            try {
                const [citVotes, reqVotes] = await Promise.all([
                    window.apiGetUserVotes(videoId, 'citation'),
                    window.apiGetUserVotes(videoId, 'request'),
                ]);
                setUserVotes({ ...citVotes, ...reqVotes });
            } catch (_) {
                // no cached votes yet — buttons just render unpressed
            }
        })();
    }, [videoId]);

    async function handleVote(itemId, voteType, itemType) {
        if (!currentUser) {
            alert('You must be logged in to vote. Please visit a YouTube video first so the extension can detect your account.');
            return;
        }
        if (!videoId) return;
        try {
            const result = await window.apiUpdateVote(itemId, voteType, itemType, videoId, currentUser);
            setTree(prev => updateScoreRecursive(prev, itemId, result.newScore));
            setFlatList(prev => prev.map(it => (it.id || it._id) === itemId ? { ...it, voteScore: result.newScore } : it));
            setOriginal(prev => (prev && (prev.id || prev._id) === itemId) ? { ...prev, voteScore: result.newScore } : prev);
            setUserVotes(prev => ({ ...prev, [itemId]: result.newVote || undefined }));
        } catch (_) {
            // transient failure — leave displayed state as-is rather than show a jarring error
        }
    }

    async function handleReply(parentItem, text) {
        if (!currentUser) throw new Error('You must be logged in to reply.');
        await window.apiAddQuickReply(parentItem.id || parentItem._id, text, parentItem.videoId || videoId, currentUser);
        await load();
    }

    async function handleDelete(item) {
        if (!window.confirm('Delete this reply?')) return;
        try {
            await window.apiDeleteCitation(item.id || item._id, item.videoId || videoId, currentUser);
            await load();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    }

    async function handleToggleResolved() {
        if (!currentUser || !original) return;
        const itemId = original.id || original._id;
        const nextResolved = !original.resolved;
        try {
            await window.apiUpdateResolved(itemId, type, videoId, nextResolved, currentUser);
            setOriginal(prev => prev && ({ ...prev, resolved: nextResolved }));
        } catch (err) {
            alert('Failed to update resolved status: ' + err.message);
        }
    }

    if (loading) return <p className="loading">Loading discussion...</p>;
    if (error) return <p className="error-message">Error loading discussion: {error}</p>;
    if (!original) return <p className="empty-message">Discussion not found.</p>;

    const items = sortItems(type === 'citation' ? tree : flatList, sort);
    const totalCount = type === 'citation' ? countAllReplies(tree) : flatList.length;
    const noun = type === 'citation'
        ? (totalCount === 1 ? 'reply' : 'replies')
        : (totalCount === 1 ? 'response' : 'responses');
    const canResolve = !!currentUser && (currentUser === original.username || !!user.isExpert);

    return (
        <div className="discussion-thread-container">
            {onBack && (
                <button className="thread-back-link" onClick={onBack}>← Back to My Discussions</button>
            )}

            {type === 'citation'
                ? <OriginalCitationCard citation={original} userVotes={userVotes} onVote={handleVote} canResolve={canResolve} onToggleResolved={handleToggleResolved} />
                : <OriginalRequestCard request={original} userVotes={userVotes} onVote={handleVote} canResolve={canResolve} onToggleResolved={handleToggleResolved} />}

            <div className="thread-controls">
                <span className="response-count">{totalCount} {noun}</span>
                <select className="thread-sort-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort replies">
                    <option value="top">Top</option>
                    <option value="new">Newest</option>
                    <option value="old">Oldest</option>
                </select>
            </div>

            <div className="thread-list">
                {items.length === 0 ? (
                    <p className="empty-message">
                        {type === 'citation' ? 'No replies yet. Be the first to reply!' : 'No responses yet. Be the first to respond!'}
                    </p>
                ) : (
                    items.map(item => (
                        <ThreadNode
                            key={item.id || item._id}
                            item={item}
                            depth={0}
                            currentUser={currentUser}
                            userVotes={userVotes}
                            onVote={handleVote}
                            onReply={handleReply}
                            onDelete={handleDelete}
                            onContinueThread={(nodeId) => onOpenDiscussion('citation', nodeId)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
