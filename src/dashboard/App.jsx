import React, { useState } from 'react';
import { UserProvider } from './context/UserContext';
import DashboardLayout from './layout/DashboardLayout';
import './styles/layout.css';

// The extension's "View discussion" links (and reply notifications) open this page
// with ?view=discussion&type=citation|request&id=... — no router library, consistent
// with this dashboard's existing plain-useState navigation.
function parseInitialView() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'discussion') {
        const type = params.get('type');
        const id = params.get('id');
        if ((type === 'citation' || type === 'request') && id) {
            return { activeView: 'discussionThread', threadTarget: { type, id } };
        }
    }
    return { activeView: 'general', threadTarget: null };
}

export default function App() {
    const [initial] = useState(parseInitialView);
    const [activeView, setActiveView] = useState(initial.activeView);
    const [threadTarget, setThreadTarget] = useState(initial.threadTarget);

    function openDiscussion(type, id) {
        setThreadTarget({ type, id });
        setActiveView('discussionThread');
    }

    return (
        <UserProvider>
            <DashboardLayout
                activeView={activeView}
                setActiveView={setActiveView}
                threadTarget={threadTarget}
                onOpenDiscussion={openDiscussion}
            />
        </UserProvider>
    );
}