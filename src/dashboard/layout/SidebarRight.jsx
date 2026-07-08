import React from 'react';
import Notifications from '../components/Notifications';

export default function SidebarRight() {
    return (
        <aside className="sidebar-right">
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px' }}>
                <Notifications />
            </div>
        </aside>
    );
}
