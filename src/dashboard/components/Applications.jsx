import React, { useState, useEffect, useCallback, useContext } from 'react';
import { UserContext } from '../context/UserContext';

export default function Applications() {
    const { user } = useContext(UserContext);
    const [applications, setApplications] = useState([]);
    const [experts, setExperts] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const [apps, verified] = await Promise.all([
            window.apiGetPendingApplications(user.username).catch(() => []),
            window.apiGetVerifiedExperts(user.username).catch(() => []),
        ]);
        setApplications(apps);
        setExperts(verified);
        setLoading(false);
    }, [user.username]);

    useEffect(() => { load(); }, [load]);

    async function reviewApplication(id, status) {
        const reason = status === 'rejected' ? prompt('Reason for rejection (optional):') : null;
        try {
            await window.apiReviewApplication(id, status, user.username, reason || null);
            setApplications(prev => prev.filter(a => a._id !== id));
            load();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    async function revokeExpert(username) {
        if (!confirm(`Remove expert status from ${username}?`)) return;
        try {
            await window.apiRevokeExpert(username, user.username);
            setExperts(prev => prev.filter(e => e.username !== username));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    if (loading) return <p className="empty-message">Loading...</p>;

    return (
        <>
            <section className="dashboard-section">
                <h2>Pending Expert Applications</h2>
                {applications.length === 0 ? (
                    <p className="empty-message">No pending applications.</p>
                ) : (
                    <div>
                        {applications.map(app => (
                            <div className="application-card admin-card" key={app._id}>
                                <div className="app-header">
                                    <span className="app-username">{app.username}</span>
                                    <span className="app-category">{(app.topics || []).join(', ')}</span>
                                </div>
                                <p className="app-credentials">{app.credentials}</p>
                                <span className="app-date">Submitted {new Date(app.submittedAt).toLocaleDateString()}</span>
                                <div className="admin-actions">
                                    <button className="approve-btn" onClick={() => reviewApplication(app._id, 'approved')}>Approve</button>
                                    <button className="reject-btn" onClick={() => reviewApplication(app._id, 'rejected')}>Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="dashboard-section">
                <h2>Verified Experts</h2>
                {experts.length === 0 ? (
                    <p className="empty-message">No verified experts.</p>
                ) : (
                    <div>
                        {experts.map(expert => (
                            <div className="application-card admin-card" key={expert._id}>
                                <div className="app-header">
                                    <span className="app-username">{expert.username}</span>
                                    <span className="app-category">{(expert.topics || []).join(', ')}</span>
                                </div>
                                <span className="app-date">Granted {new Date(expert.grantedAt).toLocaleDateString()}{expert.grantedBy ? ` by ${expert.grantedBy}` : ''}</span>
                                <div className="admin-actions">
                                    <button className="reject-btn" onClick={() => revokeExpert(expert.username)}>Revoke</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    );
}
