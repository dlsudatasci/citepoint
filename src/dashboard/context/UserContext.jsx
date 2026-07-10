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
                const expertData = await window.apiCheckExpert(storedUsername);

                setUser({
                    username: storedUsername,
                    isExpert: expertData.isExpert,
                    expertTopics: expertData.topics || [],
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
