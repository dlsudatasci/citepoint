// ─────────────────────────────────────────────
// username.js
// YouTube username/handle detection.
// Tries cached value first, then multiple DOM
// strategies with retries, then menu-click fallback.
// ─────────────────────────────────────────────

/**
 * Attempt to get the signed-in YouTube handle (@username).
 * Returns null if not logged in or handle cannot be found.
 * @returns {Promise<string|null>}
 */
async function getYouTubeUsername() {
    try {
        // Always try to detect the current user from the DOM first
        for (let i = 0; i < 5; i++) {
            if (i > 0) await _sleep(i * 400);
            const handle = _tryGetHandleFromDOM();
            if (handle) {
                _cacheUsername(handle);
                return handle;
            }
        }

        // Menu-click fallback before giving up on live detection
        const avatarBtn = document.querySelector('button#avatar-btn, ytd-masthead button#avatar-btn');
        if (avatarBtn) {
            const handle = await _getHandleViaMenu(avatarBtn);
            if (handle) {
                _cacheUsername(handle);
                return handle;
            }
        }

        // Only use cache as a last resort — avoids returning a stale
        // account handle when the user has switched YouTube accounts
        const cached = await getCachedUsername();
        if (cached) {
            console.log('[username] Falling back to cached handle:', cached);
            return cached;
        }

        console.log('[username] Could not find user handle — user may not be logged in');
        return null;

    } catch (err) {
        console.error('[username] Error:', err);
        return null;
    }
}

/**
 * Return cached username from chrome.storage.local.
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

/**
 * Try every known way to read the handle from the current DOM state.
 * Returns the handle string (starting with @) or null.
 */
function _tryGetHandleFromDOM() {
    // 1. YouTube internal yt.config_ object
    try {
        const cfg = window.yt?.config_;
        if (cfg?.CHANNEL_HANDLE) return _normalizeHandle(cfg.CHANNEL_HANDLE);
        if (cfg?.DELEGATED_SESSION_ID) {
            // not the handle itself, but confirms login — continue to other strategies
        }
    } catch (_) {}

    // 2. Polymer __data on the topbar button (multiple paths)
    const topbarBtn = document.querySelector('ytd-topbar-menu-button-renderer');
    if (topbarBtn) {
        const candidates = [
            topbarBtn.__data?.data?.channelHandle,
            topbarBtn.__data?.channelHandle,
            topbarBtn.__data?.label,
        ];
        for (const val of candidates) {
            const h = _normalizeHandle(val);
            if (h) return h;
        }
    }

    // 3. Many static DOM selectors — YouTube changes these occasionally
    const selectors = [
        'ytd-guide-entry-renderer[line-end-style="handle"] #guide-entry-title',
        'yt-formatted-string#channel-handle',
        '[id="channel-handle"]',
        'ytd-active-account-header-renderer #channel-handle',
        'ytd-active-account-header-renderer yt-formatted-string',
        'ytd-account-item-renderer #channel-handle',
        '#avatar-channel-handle',
        'tp-yt-paper-item #channel-handle',
        'ytd-compact-link-renderer #endpoint #label',
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        const h = _normalizeHandle(el?.textContent?.trim());
        if (h) return h;
    }

    return null;
}

/**
 * Open the account menu briefly, observe the DOM for the handle, then close it.
 */
async function _getHandleViaMenu(avatarBtn) {
    return new Promise(resolve => {
        let settled = false;
        let timeoutId;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            observer.disconnect();
            _closeMenu(avatarBtn);
            resolve(result);
        };

        const observer = new MutationObserver(() => {
            const menuSelectors = [
                'ytd-active-account-header-renderer yt-formatted-string#channel-handle',
                'ytd-active-account-header-renderer #channel-handle',
                'ytd-multi-page-menu-renderer #channel-handle',
                'tp-yt-paper-listbox ytd-account-item-renderer #channel-handle',
            ];
            for (const sel of menuSelectors) {
                const h = _normalizeHandle(document.querySelector(sel)?.textContent?.trim());
                if (h) { finish(h); return; }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        timeoutId = setTimeout(() => finish(null), 2000);

        avatarBtn.click();
        // Retry click if menu didn't open within 150 ms
        setTimeout(() => {
            if (!settled && !document.querySelector('ytd-popup-container tp-yt-iron-dropdown[focused]')) {
                avatarBtn.click();
            }
        }, 150);
    });
}

function _closeMenu(avatarBtn) {
    const isOpen = document.querySelector('ytd-popup-container tp-yt-iron-dropdown[focused]');
    if (isOpen) avatarBtn?.click();
}

function _cacheUsername(handle) {
    chrome.storage.local.set({ youtubeUsername: handle }, () => {
        console.log('[username] Cached:', handle);
    });
}

/** Ensure handle starts with @ and is non-empty, else return null. */
function _normalizeHandle(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('@') ? trimmed : null;
}

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
