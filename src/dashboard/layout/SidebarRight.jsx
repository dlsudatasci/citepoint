import React from 'react';
import Notifications from '../components/Notifications';

export default function SidebarRight() {
    return (
        <aside className="sidebar-right">
            <div className="cp-card cp-card--comfortable">
                <Notifications />
            </div>
        </aside>
    );
}
