import React, { useState, useEffect, useContext, useCallback } from 'react';
import { UserContext } from '../context/UserContext';

const ICONS = {
    new_citation: '📄',
    new_request: '❓',
    application_approved: '✅',
    application_rejected: '❌',
    reply: '💬',
};

export default function Notifications({ onOpenDiscussion }) {
    const { user } = useContext(UserContext);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!user.username) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await window.apiGetNotifications(user.username, 1);
            setNotifications(res.notifications || []);
            setUnreadCount(res.unreadCount || 0);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [user.username]);

    useEffect(() => {
        load();
    }, [load]);

    async function markRead(id) {
        try {
            await window.apiMarkNotificationRead(id, user.username);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (_) {}
    }

    async function markAllRead() {
        try {
            await window.apiMarkAllNotificationsRead(user.username);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (_) {}
    }

    if (!user.username) {
        return <p className="empty-message">Log in to YouTube to see notifications.</p>;
    }
    if (loading) {
        return <p className="empty-message">Loading...</p>;
    }
    if (error) {
        return <p className="error-message">Could not load notifications.</p>;
    }

    return (
        <div>
            <div className="notif-header">
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                    Notifications {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
                </h3>
                {unreadCount > 0 && (
                    <button className="mark-all-btn" onClick={markAllRead}>Mark all read</button>
                )}
            </div>

            {notifications.length === 0 ? (
                <p className="empty-message">No notifications yet.</p>
            ) : (
                <div id="notifications-list">
                    {notifications.map(n => (
                        <div
                            key={n._id}
                            className={`notif-item ${n.read ? '' : 'unread'}`}
                            onClick={() => {
                                if (!n.read) markRead(n._id);
                                if (n.type === 'reply' && n.rootItemId && n.rootItemType && onOpenDiscussion) {
                                    onOpenDiscussion(n.rootItemType, n.rootItemId);
                                }
                            }}
                        >
                            <span className="notif-icon">{ICONS[n.type] || '❌'}</span>
                            <div className="notif-body">
                                <span className="notif-title">{n.title}</span>
                                {n.category && <span className="notif-category">{n.category}</span>}
                                <span className="notif-time">{new Date(n.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
