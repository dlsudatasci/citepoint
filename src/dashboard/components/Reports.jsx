import React, { useState, useEffect, useCallback, useContext } from 'react';
import { UserContext } from '../context/UserContext';

export default function Reports() {
    const { user } = useContext(UserContext);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const reps = await window.apiGetPendingReports(user.username)
            .catch(err => { console.error('[Reports] error:', err); return []; });
        setReports(reps);
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

    if (loading) return <p className="empty-message">Loading...</p>;

    return (
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
    );
}
