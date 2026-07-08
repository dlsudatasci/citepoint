import React from 'react';
import GeneralFeed from '../components/GeneralFeed';
import ExpertFeed from '../components/ExpertFeed';
import Analytics from '../components/Analytics';
import Profile from '../components/Profile';

export default function MainContent({ activeView }) {

    const renderContent = () => {
        switch (activeView) {
            case 'general':
                return <GeneralFeed />;
            case 'expert':
                return <ExpertFeed />;
            case 'analytics':
                return <Analytics />;
            case 'profile':
                return <Profile />;
            default:
                return <GeneralFeed />;
        }
    };

    return (
        <main className="main-content">
            {renderContent()}
        </main>
    );
}
