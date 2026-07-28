import React, { useState, useEffect, useCallback, useContext } from 'react';
import { UserContext } from '../context/UserContext';

export default function Reports() {
    const { user } = useContext(UserContext);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pendingApplications, setPendingApplications] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        const [reps, apps] = await Promise.all([
            window.apiGetPendingReports(user.username).catch(err => { console.error('[Reports] pending reports error:', err); return []; }),
            window.apiGetPendingApplications(user.username).catch(err => { console.error('[Reports] pending apps error:', err); return []; }),
        ]);
        setReports(reps);
        setPendingApplications(apps);
        setLoading(false);
    }, [user.username]);

    useEffect(() => { load(); }, [load]);

    async function resolve(id, status) {
        try {
            await window.apiResolveReport(id, status, user.username);
            setReports(prev => prev.filter(r => r._id !== id));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    async function takedown(id) {
        if (!window.confirm('Take down this content? The owner will be notified.')) return;
        try {
            await window.apiTakedownReport(id, user.username);
            setReports(prev => prev.filter(r => r._id !== id));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    async function reviewApplication(id, status) {
        const reason = status === 'rejected' ? prompt('Reason for rejection (optional):') : null;
        try {
            await window.apiReviewApplication(id, status, user.username, reason || null);
            setPendingApplications(prev => prev.filter(a => a._id !== id));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    if (loading) return <p className="empty-message">Loading...</p>;

    return (
        <div>
            <section className="dashboard-section">
                <h2>Pending Expert Applications</h2>
                {pendingApplications.length === 0 ? (
                    <p className="empty-message">No pending applications.</p>
                ) : (
                    <div>
                        {pendingApplications.map(app => (
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
                <h2>Pending Reports</h2>
                {reports.length === 0 ? (
                    <p className="empty-message">No pending reports.</p>
                ) : (
                    <div>
                        {reports.map(report => (
                            <div className="application-card admin-card" key={report._id}>
                                <div className="app-header">
                                    <span className="app-username">{report.reporterUsername}</span>
                                    <span className="app-category">{report.itemType}</span>
                                </div>
                                <p className="app-credentials"><strong>Reason:</strong> {report.reason}</p>
                                {report.additionalInfo && <p className="app-credentials">{report.additionalInfo}</p>}
                                <span className="app-date">Reported {new Date(report.timestamp).toLocaleDateString()}</span>
                                <div className="admin-actions">
                                    <button className="reject-btn" style={{background:'#c0392b'}} onClick={() => takedown(report._id)}>Take Down</button>
                                    <button className="approve-btn" onClick={() => resolve(report._id, 'reviewed')}>Mark Reviewed</button>
                                    <button className="reject-btn" onClick={() => resolve(report._id, 'dismissed')}>Dismiss</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
