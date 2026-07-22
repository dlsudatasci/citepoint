import React, { useState, useEffect, useContext, useCallback } from 'react';
import { UserContext } from '../context/UserContext';

function ProfileStats({ username }) {
    const { user } = useContext(UserContext);
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState(null);
    const [expert, setExpert] = useState(null);
    const [error, setError] = useState(null);
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [saveLabel, setSaveLabel] = useState('Save Profile');

    const load = useCallback(async () => {
        try {
            const res = await window.apiGetProfile(username);
            setProfile(res.profile);
            setStats(res.stats);
            setExpert(res.expert);
            setDisplayName(res.profile.displayName || '');
            setBio(res.profile.bio || '');
        } catch (err) {
            setError(err.message);
        }
    }, [username]);

    useEffect(() => { load(); }, [load]);

    async function handleSave(e) {
        e.preventDefault();
        try {
            await window.apiUpdateProfile(username, {
                displayName: displayName.trim(),
                bio: bio.trim(),
            });
            setSaveLabel('Saved!');
            setTimeout(() => setSaveLabel('Save Profile'), 2000);
        } catch (err) {
            alert('Error saving profile: ' + err.message);
        }
    }

    if (error) return <p className="error-message">Could not load profile.</p>;
    if (!stats) return <p className="empty-message">Loading...</p>;

    return (
        <>
            <div className="profile-stats-row">
                <div className="stat-card"><span className="stat-number">{stats.citations}</span><span className="stat-label">Citations</span></div>
                <div className="stat-card"><span className="stat-number">{stats.requests}</span><span className="stat-label">Requests</span></div>
                <div className="stat-card"><span className="stat-number">{stats.upvotes}</span><span className="stat-label">Upvotes</span></div>
                {expert && (
                    <div className="stat-card stat-expert">
                        <span className="stat-number" aria-hidden="true">✓</span>
                        <span className="stat-label">Expert: {(expert.topics || []).join(', ')}</span>
                    </div>
                )}
            </div>

            <form id="profile-form" onSubmit={handleSave}>
                <div className="form-group">
                    <label htmlFor="profile-display-name">Display Name:</label>
                    <input
                        type="text" id="profile-display-name" placeholder="Your display name"
                        value={displayName} onChange={e => setDisplayName(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="profile-bio">Bio:</label>
                    <textarea
                        id="profile-bio" rows="3" maxLength="500" placeholder="Tell others about yourself..."
                        value={bio} onChange={e => setBio(e.target.value)}
                    />
                </div>
                <button type="submit" className="submit-btn">{saveLabel}</button>
            </form>
        </>
    );
}

function ProfileHistory({ username }) {
    const [items, setItems] = useState([]);

    useEffect(() => {
        let isMounted = true;
        window.apiGetProfileHistory(username, 1).then(history => {
            if (!isMounted) return;
            const combined = [
                ...(history.citations || []).map(c => ({ id: `citation:${c._id}`, type: 'Citation', title: c.citationTitle, date: c.dateAdded, score: c.voteScore })),
                ...(history.requests || []).map(r => ({ id: `request:${r._id}`, type: 'Request', title: r.title, date: r.dateAdded, score: r.voteScore })),
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
            setItems(combined);
        }).catch(() => {});
        return () => { isMounted = false; };
    }, [username]);

    if (items.length === 0) return null;

    return (
        <div id="profile-history">
            <h3>Recent Activity</h3>
            {items.map((item) => (
                <div className="history-item" key={item.id}>
                    <span className={`history-type ${item.type === 'Citation' ? 'type-citation' : 'type-request'}`}>{item.type}</span>
                    <span className="history-title">{item.title || 'Untitled'}</span>
                    <span className="history-score" aria-label={`${item.score ?? 0} votes`}><span aria-hidden="true">▲ {item.score ?? 0}</span></span>
                    <span className="history-date">{new Date(item.date).toLocaleDateString()}</span>
                </div>
            ))}
        </div>
    );
}

function ExpertApplicationForm({ username, onSubmitted }) {
    const [selected, setSelected] = useState([]);
    const [credentials, setCredentials] = useState('');
    const topicsList = window.TOPICS || [];

    function toggleTopic(topic) {
        setSelected(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (selected.length === 0) { alert('Please select at least one topic.'); return; }
        try {
            await window.apiApplyExpert(username, selected, credentials.trim());
            onSubmitted();
        } catch (err) {
            alert('Error: ' + (err.message || 'Failed to submit application'));
        }
    }

    return (
        <div id="expert-apply-form">
            <h3>Apply to Become a Verified Expert</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Expertise Topics:</label>
                    <div className="topic-checkbox-group">
                        {topicsList.map(topic => (
                            <label className="topic-checkbox-label" key={topic}>
                                <input
                                    type="checkbox" checked={selected.includes(topic)}
                                    onChange={() => toggleTopic(topic)}
                                />
                                {topic}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="expert-credentials">Credentials (degree, license, portfolio link, etc.):</label>
                    <textarea
                        id="expert-credentials" rows="4" required
                        placeholder="Describe your qualifications for these topics..."
                        value={credentials} onChange={e => setCredentials(e.target.value)}
                    />
                </div>
                <button type="submit" className="submit-btn">Submit Application</button>
            </form>
        </div>
    );
}

function MyApplications({ username, refreshKey }) {
    const [apps, setApps] = useState([]);

    useEffect(() => {
        let isMounted = true;
        window.apiGetMyApplications(username).then(a => { if (isMounted) setApps(a || []); }).catch(() => {});
        return () => { isMounted = false; };
    }, [username, refreshKey]);

    if (apps.length === 0) return null;

    return (
        <div id="expert-applications-list">
            <h3>Your Applications</h3>
            {apps.map(app => {
                const statusClass = app.status === 'approved' ? 'status-approved' : app.status === 'rejected' ? 'status-rejected' : 'status-pending';
                return (
                    <div className="application-card" key={app._id}>
                        <div className="app-header">
                            <span className="app-category">{(app.topics || []).join(', ')}</span>
                            <span className={`app-status ${statusClass}`}>{app.status}</span>
                        </div>
                        <p className="app-credentials">{app.credentials}</p>
                        {app.reason && <p className="app-reason">Reason: {app.reason}</p>}
                        <span className="app-date">Submitted {new Date(app.submittedAt).toLocaleDateString()}</span>
                    </div>
                );
            })}
        </div>
    );
}

function AdminPanel({ adminUsername, onReviewed }) {
    const [apps, setApps] = useState(null); // null = not authorized / not loaded yet

    const load = useCallback(async () => {
        try {
            const res = await window.apiGetPendingApplications(adminUsername);
            setApps(res || []);
        } catch (_) {
            // Not an admin, or request failed — silently hide the section, same as
            // the vanilla dashboard did (no error shown to non-admin experts).
            setApps(null);
        }
    }, [adminUsername]);

    useEffect(() => { load(); }, [load]);

    async function review(id, status) {
        const reason = status === 'rejected' ? prompt('Reason for rejection (optional):') : null;
        try {
            await window.apiReviewApplication(id, status, adminUsername, reason || null);
            setApps(prev => prev.filter(a => a._id !== id));
            onReviewed();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    if (!apps) return null;

    return (
        <section className="dashboard-section" id="admin-section">
            <h2>Admin: Pending Expert Applications</h2>
            {apps.length === 0 ? (
                <p className="empty-message">No pending applications.</p>
            ) : (
                <div id="admin-pending-list">
                    {apps.map(app => (
                        <div className="application-card admin-card" key={app._id}>
                            <div className="app-header">
                                <span className="app-username">{app.username}</span>
                                <span className="app-category">{(app.topics || []).join(', ')}</span>
                            </div>
                            <p className="app-credentials">{app.credentials}</p>
                            <span className="app-date">Submitted {new Date(app.submittedAt).toLocaleDateString()}</span>
                            <div className="admin-actions">
                                <button className="approve-btn" onClick={() => review(app._id, 'approved')}>Approve</button>
                                <button className="reject-btn" onClick={() => review(app._id, 'rejected')}>Reject</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export default function Profile() {
    const { user, refreshUser } = useContext(UserContext);
    const [refreshKey, setRefreshKey] = useState(0);
    const [justApplied, setJustApplied] = useState(false);

    if (!user.username) {
        return <p className="empty-message">Log in to YouTube to view your profile.</p>;
    }

    function handleApplicationSubmitted() {
        setJustApplied(true);
        setRefreshKey(k => k + 1);
    }

    function handleReviewed() {
        refreshUser();
        setRefreshKey(k => k + 1);
    }

    return (
        <div>
            <section className="dashboard-section" id="profile-section">
                <h2>My Profile</h2>
                <div id="profile-content">
                    <ProfileStats username={user.username} key={`stats-${refreshKey}`} />
                    <ProfileHistory username={user.username} />
                </div>
            </section>

            <section className="dashboard-section" id="expert-section">
                <h2>Expert Verification</h2>
                {user.isExpert ? (
                    <div className="expert-badge-banner">
                        <span className="expert-check" aria-hidden="true">✓</span> Verified Expert — {(user.expertTopics || []).join(', ') || 'No topics assigned'}
                    </div>
                ) : justApplied ? (
                    <p className="success-message">Application submitted! You will be notified when reviewed.</p>
                ) : (
                    <>
                        <p>You are not yet a verified expert.</p>
                        <ExpertApplicationForm username={user.username} onSubmitted={handleApplicationSubmitted} />
                    </>
                )}
                <MyApplications username={user.username} refreshKey={refreshKey} />
            </section>

            <AdminPanel adminUsername={user.username} onReviewed={handleReviewed} />
        </div>
    );
}
