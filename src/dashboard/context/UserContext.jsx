import React, { createContext, useState, useEffect } from 'react';

export const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState({
        username: null,
        isExpert: false,
        expertTopics: [],
        loading: true
    });

    useEffect(() => {
        const initUser = async () => {
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
                        expertTopics: expertData.expertTopics || [],
                        loading: false
                    });
                } else {
                    setUser(prev => ({ ...prev, loading: false }));
                }
            } catch (error) {
                console.error("[React] Failed to load user session:", error);
                setUser(prev => ({ ...prev, loading: false }));
            }
        };

        initUser();
    }, []);

    return (
        <UserContext.Provider value={{ user, setUser }}>
            {children}
        </UserContext.Provider>
    );
};