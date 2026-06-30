import React, { useState } from 'react';
import { UserProvider } from './context/UserContext';
import DashboardLayout from './layout/DashboardLayout';
import './styles/layout.css';

export default function App() {
    const [activeView, setActiveView] = useState('general');

    return (
        <UserProvider>
            <DashboardLayout activeView={activeView} setActiveView={setActiveView} />
        </UserProvider>
    );
}