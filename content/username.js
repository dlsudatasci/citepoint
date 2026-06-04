// ─────────────────────────────────────────────
// username.js
// YouTube username/handle detection.
// Tries cached value first, then multiple DOM
// strategies with retries, then a fast menu-click
// fallback on first run only (closes in ~500ms).
// ─────────────────────────────────────────────

/**
 * Attempt to get the signed-in YouTube handle (@username).
 * Returns null if not logged in or handle cannot be found.
 * @returns {Promise<string|null>}
 */
async function getYouTubeUsername() {
    try {
        // 1. Check cache first — covers test mockLogin and returning users.
        const cached = await getCachedUsername();
        if (cached) {
            console.log('[username] Using cached handle:', cached);
            return cached;
        }

        // 2. Try DOM detection — no side effects, no clicks
        for (let i = 0; i < 5; i++) {
            if (i > 0) await _sleep(i * 400);
            const handle = _tryGetHandleFromDOM();
            if (handle) {
                _cacheUsername(handle);
                return handle;
            }
        }

        // 3. Menu-click fallback — only runs on first session when cache is empty
        //    and DOM detection failed. Closes in ~500ms so user barely notices.
        const avatarBtn = document.querySelector('button#avatar-btn, ytd-masthead button#avatar-btn');
        if (avatarBtn) {
            const handle = await _getHandleViaMenu(avatarBtn);
            if (handle) {
                _cacheUsername(handle);
                return handle;
            }
        }

        console.log('[username] Could not find user handle — user may not be logged in');
        return null;

    } catch (err) {
        console.error('[username] Error:', err);
        return null;
    }
}

/**
 * Return cached username.
 * Tries chrome.storage.local first, falls back to localStorage.
 * @returns {Promise<string|null>}
 */
async function getCachedUsername() {
    // Try chrome.storage.local first
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => {
                chrome.storage.local.get(['youtubeUsername'], result => {
                    resolve(result.youtubeUsername || null);
                });
            });
        }
    } catch (_) {}

    // Fallback to localStorage
    try {
        return localStorage.getItem('youtubeUsername') || null;
    } catch (_) {}

    return null;
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
 * Open the account menu briefly, observe the DOM for the handle, then close.
 * Resolves in at most 500ms — fast enough that the menu flash is barely noticeable.
 * Only called on first session when cache is empty and DOM detection failed.
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
            // Close menu immediately
            setTimeout(() => _closeMenu(avatarBtn), 50);
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

        // Give up after 500ms
        timeoutId = setTimeout(() => finish(null), 500);

        avatarBtn.click();
        // Retry click if menu didn't open within 150ms
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

/**
 * Cache username.
 * Writes to chrome.storage.local and localStorage as fallback.
 */
function _cacheUsername(handle) {
    // chrome.storage.local — primary
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ youtubeUsername: handle }, () => {
                console.log('[username] Cached:', handle);
            });
        }
    } catch (_) {}

    // localStorage — fallback for Firefox/Selenium environments
    try {
        localStorage.setItem('youtubeUsername', handle);
    } catch (_) {}
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