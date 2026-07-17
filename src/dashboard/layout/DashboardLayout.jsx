import React from 'react';
import SidebarLeft from './SidebarLeft';
import SidebarRight from './SidebarRight';
import MainContent from './MainContent';

export default function DashboardLayout({ activeView, setActiveView, threadTarget, onOpenDiscussion }) {
    return (
        <div className="dashboard-layout">
            <SidebarLeft activeView={activeView} setActiveView={setActiveView} />
            <MainContent
                activeView={activeView}
                setActiveView={setActiveView}
                threadTarget={threadTarget}
                onOpenDiscussion={onOpenDiscussion}
            />
            <SidebarRight onOpenDiscussion={onOpenDiscussion} />
        </div>
    );
}