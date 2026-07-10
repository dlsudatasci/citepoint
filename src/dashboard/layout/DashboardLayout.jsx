import React from 'react';
import SidebarLeft from './SidebarLeft';
import SidebarRight from './SidebarRight';
import MainContent from './MainContent';

export default function DashboardLayout({ activeView, setActiveView }) {
    return (
        <div className="dashboard-layout">
            <SidebarLeft activeView={activeView} setActiveView={setActiveView} />
            <MainContent activeView={activeView} />
            <SidebarRight />
        </div>
    );
}