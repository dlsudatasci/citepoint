import React from 'react';

export default function SidebarRight() {
    return (
        <aside className="sidebar-right">
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Live Notifications</h3>
                <p style={{ color: '#606060', fontSize: '14px' }}>No new notifications.</p>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Trending Topics</h3>
                <p style={{ color: '#606060', fontSize: '14px' }}>Loading trends...</p>
            </div>
        </aside>
    );
}