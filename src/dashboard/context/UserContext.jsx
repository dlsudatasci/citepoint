import React, { createContext, useState, useEffect, useCallback } from 'react';

export const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState({
        username: null,
        isExpert: false,
        expertTopics: [],
        loading: true
    });

    const loadUser = useCallback(async () => {
        try {
            const storedUsername = await new Promise(resolve => {
                chrome.storage.local.get(['youtubeUsername'], result => {
                    resolve(result.youtubeUsername || null);
                });
            });

            if (storedUsername) {
                const [expertData, adminCheck] = await Promise.all([
                    window.apiCheckExpert(storedUsername),
                    window.apiGetPendingApplications(storedUsername).then(() => true).catch(() => false),
                ]);

                setUser({
                    username: storedUsername,
                    isExpert: expertData.isExpert,
                    expertTopics: expertData.topics || [],
                    isAdmin: adminCheck,
                    loading: false
                });
            } else {
                setUser({ username: null, isExpert: false, expertTopics: [], loading: false });
            }
        } catch (error) {
            console.error("[React] Failed to load user session:", error);
            setUser(prev => ({ ...prev, loading: false }));
        }
    }, []);

    useEffect(() => {
        loadUser();
    }, [loadUser]);

    return (
        <UserContext.Provider value={{ user, setUser, refreshUser: loadUser }}>
            {children}
        </UserContext.Provider>
    );
};
