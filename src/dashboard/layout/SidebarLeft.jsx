import React, { useContext } from 'react';
import { UserContext } from '../context/UserContext';

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
                    onClick={() => setActiveView('general')}
                >
                 General Feed
                </button>

                {/* only render Expert Feed button if they are verified */}
                {user.isExpert && (
                    <button 
                        className={`nav-item ${activeView === 'expert' ? 'active' : ''}`}
                        onClick={() => setActiveView('expert')}
                    >
                     Expert Feed
                    </button>
                )}

                <button 
                    className={`nav-item ${activeView === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveView('analytics')}
                >
                 Analytics
                </button>
            </nav>

            <div className="sidebar-spacer"></div>

            <nav className="nav-menu">
                <button 
                    className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
                    onClick={() => setActiveView('profile')}
                >
                 {user.username || 'Log In'}
                </button>
            </nav>
        </aside>
    );
}