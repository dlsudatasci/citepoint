import React from 'react';
import GeneralFeed from '../components/GeneralFeed';
import ExpertFeed from '../components/ExpertFeed';
import Analytics from '../components/Analytics';
import Profile from '../components/Profile';
import MyDiscussions from '../components/MyDiscussions';
import DiscussionThread from '../components/DiscussionThread';
import Reports from '../components/Reports';
import Applications from '../components/Applications';

export default function MainContent({ activeView, setActiveView, threadTarget, onOpenDiscussion }) {

    const renderContent = () => {
        switch (activeView) {
            case 'general':
                return <GeneralFeed />;
            case 'expert':
                return <ExpertFeed />;
            case 'analytics':
                return <Analytics />;
            case 'reports':
                return <Reports />;
            case 'applications':
                return <Applications />;
            case 'profile':
                return <Profile />;
            case 'discussions':
                return <MyDiscussions onOpenDiscussion={onOpenDiscussion} />;
            case 'discussionThread':
                return threadTarget ? (
                    <DiscussionThread
                        type={threadTarget.type}
                        id={threadTarget.id}
                        onOpenDiscussion={onOpenDiscussion}
                        onBack={() => setActiveView('discussions')}
                    />
                ) : <MyDiscussions onOpenDiscussion={onOpenDiscussion} />;
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
