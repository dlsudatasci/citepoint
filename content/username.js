// ─────────────────────────────────────────────
// username.js
// All YouTube username/handle detection logic.
// Tries three strategies in order, caches result.
// ─────────────────────────────────────────────

/**
 * Attempt to get the signed-in YouTube handle (@username).
 * Returns null if the user is not logged in or handle cannot be found.
 * Also persists the result in chrome.storage.local for use elsewhere.
 * @returns {Promise<string|null>}
 */
async function getYouTubeUsername() {
    try {
        // ── Strategy 1: YouTube internal polymer __data ──────────────
        const accountInfo = document.querySelector('ytd-topbar-menu-button-renderer');
        if (!accountInfo) {
            console.log('[username] Account info element not found — user likely not logged in');
            return null;
        }

        if (accountInfo.__data?.data?.channelHandle) {
            const handle = accountInfo.__data.data.channelHandle;
            const normalized = handle.startsWith('@') ? handle : `@${handle}`;
            _cacheUsername(normalized);
            return normalized;
        }

        // ── Strategy 2: Static DOM elements ─────────────────────────
        const candidates = [
            document.querySelector('ytd-guide-entry-renderer[line-end-style="handle"] #guide-entry-title'),
            document.querySelector('yt-formatted-string#channel-handle'),
            document.querySelector('[id="channel-handle"]'),
        ];

        for (const el of candidates) {
            if (el?.textContent) {
                const handle = el.textContent.trim();
                if (handle.startsWith('@')) {
                    _cacheUsername(handle);
                    return handle;
                }
            }
        }

        // ── Strategy 3: Open/close account menu, observe DOM ─────────
        console.log('[username] Attempting quick menu open to get handle...');
        const avatarButton = document.querySelector('ytd-masthead button#avatar-btn');
        if (!avatarButton) return null;

        const foundHandle = await _getHandleViaMenu(avatarButton);

        if (foundHandle) {
            _cacheUsername(foundHandle);
            return foundHandle;
        }

        console.log('[username] Could not find user handle');
        return null;

    } catch (err) {
        console.error('[username] Error:', err);
        return null;
    }
}

/**
 * Get the cached username synchronously from chrome.storage.local.
 * @returns {Promise<string|null>}
 */
async function getCachedUsername() {
    return new Promise(resolve => {
        chrome.storage.local.get(['youtubeUsername'], result => {
            resolve(result.youtubeUsername || null);
        });
    });
}

// ── Private helpers ───────────────────────────

function _cacheUsername(handle) {
    chrome.storage.local.set({ youtubeUsername: handle }, () => {
        console.log('[username] Cached:', handle);
    });
}

async function _getHandleViaMenu(avatarButton) {
    return new Promise(resolve => {
        let timeoutId;

        const observer = new MutationObserver((_, obs) => {
            const menuHandle = document.querySelector(
                'ytd-active-account-header-renderer yt-formatted-string#channel-handle'
            );
            if (menuHandle?.textContent) {
                const handle = menuHandle.textContent.trim();
                if (handle.startsWith('@')) {
                    clearTimeout(timeoutId);
                    obs.disconnect();
                    _closeMenu(avatarButton);
                    resolve(handle);
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        timeoutId = setTimeout(() => {
            observer.disconnect();
            _closeMenu(avatarButton);
            resolve(null);
        }, 1000);

        avatarButton.click();

        // Retry click if menu didn't open
        setTimeout(() => {
            const menu = document.querySelector('ytd-popup-container tp-yt-iron-dropdown[focused]');
            if (!menu) avatarButton.click();
        }, 100);
    });
}

function _closeMenu(avatarButton) {
    const isOpen = document.querySelector('ytd-popup-container tp-yt-iron-dropdown[focused]');
    if (isOpen) avatarButton?.click();
}
