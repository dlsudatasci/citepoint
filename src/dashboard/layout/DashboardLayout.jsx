import React from 'react';
import SidebarLeft from './SidebarLeft';
import SidebarRight from './SidebarRight';
import MainContent from './MainContent';
import ErrorBoundary from '../components/ErrorBoundary';

export default function DashboardLayout({ activeView, setActiveView, threadTarget, onOpenDiscussion }) {
    return (
        <div className="dashboard-layout">
            <SidebarLeft activeView={activeView} setActiveView={setActiveView} />
            {/* Keyed by activeView so switching views via the sidebar (which stays
                usable outside this boundary) also resets a caught error, not just
                the fallback's own "Try again" button. */}
            <ErrorBoundary key={activeView}>
                <MainContent
                    activeView={activeView}
                    setActiveView={setActiveView}
                    threadTarget={threadTarget}
                    onOpenDiscussion={onOpenDiscussion}
                />
            </ErrorBoundary>
            <SidebarRight onOpenDiscussion={onOpenDiscussion} />
        </div>
    );
}