import React, { useContext } from 'react';
import { UserContext } from '../context/UserContext';
import ThemeSelector from '../components/ThemeSelector';

export default function SidebarLeft({ activeView, setActiveView }) {
    const { user } = useContext(UserContext);

    return (
        <aside className="sidebar-left">
            <div className="brand-logo">
                CitePoint
            </div>
            
            <nav className="nav-menu">
                <button
                    className={`nav-item ${activeView === 'general' ? 'active' : ''}`}
                    aria-current={activeView === 'general' ? 'page' : undefined}
                    onClick={() => setActiveView('general')}
                >
                 General Feed
                </button>

                <button
                    className={`nav-item ${activeView === 'discussions' || activeView === 'discussionThread' ? 'active' : ''}`}
                    aria-current={activeView === 'discussions' || activeView === 'discussionThread' ? 'page' : undefined}
                    onClick={() => setActiveView('discussions')}
                >
                 Discussions
                </button>

                {/* only render Expert Feed button if they are verified */}
                {user.isExpert && (
                    <button
                        className={`nav-item ${activeView === 'expert' ? 'active' : ''}`}
                        aria-current={activeView === 'expert' ? 'page' : undefined}
                        onClick={() => setActiveView('expert')}
                    >
                     Expert Feed
                    </button>
                )}

                <button
                    className={`nav-item ${activeView === 'analytics' ? 'active' : ''}`}
                    aria-current={activeView === 'analytics' ? 'page' : undefined}
                    onClick={() => setActiveView('analytics')}
                >
                 Analytics
                </button>
            </nav>

            <div className="sidebar-spacer"></div>

            <nav className="nav-menu">
                <button
                    className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
                    aria-current={activeView === 'profile' ? 'page' : undefined}
                    onClick={() => setActiveView('profile')}
                >
                 {user.username || 'Log In'}
                </button>
            </nav>

            <ThemeSelector />
        </aside>
    );
}