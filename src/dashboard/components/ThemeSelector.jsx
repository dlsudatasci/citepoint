import React, { useEffect, useState } from 'react';

export default function ThemeSelector() {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        // Load initial theme
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get('theme', (res) => {
                setTheme(res.theme || 'light');
            });

            // Listen for changes from other sources
            const listener = (changes, area) => {
                if (area === 'local' && changes.theme) {
                    setTheme(changes.theme.newValue || 'light');
                }
            };
            chrome.storage.onChanged.addListener(listener);

            return () => {
                chrome.storage.onChanged.removeListener(listener);
            };
        }
    }, []);

    const handleChange = (e) => {
        const newTheme = e.target.value;
        setTheme(newTheme);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ theme: newTheme });
        }
    };

    // Use AVAILABLE_THEMES from global window object if available, otherwise fallback
    const availableThemes = window.AVAILABLE_THEMES || [
        { id: 'light', label: 'Light (Default)' },
        { id: 'dark', label: 'Dark Mode' },
        { id: 'dlsu', label: 'Archer Green' }
    ];

    return (
        <div className="theme-selector-dashboard" style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--cp-border)' }}>
            <label htmlFor="dashboard-theme" style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--cp-text-secondary)' }}>
                Theme
            </label>
            <select
                id="dashboard-theme"
                value={theme}
                onChange={handleChange}
                style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--cp-border-input)',
                    backgroundColor: 'var(--cp-bg-surface)',
                    color: 'var(--cp-text-primary)',
                    cursor: 'pointer',
                    fontSize: '13px'
                }}
            >
                {availableThemes.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                ))}
            </select>
        </div>
    );
}
