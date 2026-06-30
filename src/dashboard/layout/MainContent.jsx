import React from 'react';

export default function MainContent({ activeView }) {
    
    const renderContent = () => {
        switch (activeView) {
            case 'general':
                return <h2>General Citation Requests</h2>;
            case 'expert':
                return <h2>Expert Dashboard</h2>;
            case 'analytics':
                return <h2>Overview Analytics</h2>;
            case 'profile':
                return <h2>My Profile Settings</h2>;
            default:
                return <h2>General Citation Requests</h2>;
        }
    };

    return (
        <main className="main-content">
            {renderContent()}
        </main>
    );
}