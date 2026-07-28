import React, { useState, useEffect, useCallback, useContext } from 'react';
import { UserContext } from '../context/UserContext';

export default function Applications() {
    const { user } = useContext(UserContext);
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const apps = await window.apiGetPendingApplications(user.username)
            .catch(err => { console.error('[Applications] error:', err); return []; });
        setApplications(apps);
        setLoading(false);
    }, [user.username]);

    useEffect(() => { load(); }, [load]);

    async function reviewApplication(id, status) {
        const reason = status === 'rejected' ? prompt('Reason for rejection (optional):') : null;
        try {
            await window.apiReviewApplication(id, status, user.username, reason || null);
            setApplications(prev => prev.filter(a => a._id !== id));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    if (loading) return <p className="empty-message">Loading...</p>;

    return (
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
    );
}
