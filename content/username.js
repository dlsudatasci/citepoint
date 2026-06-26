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
        // 1. Check cache first — covers returning users across page navigations.
        const cached = await getCachedUsername();
        if (cached) {
            console.log('[username] Using cached handle:', cached);
            return cached;
        }

        // 2. Quick DOM check — may already be available
        const quick = _tryGetHandleFromDOM();
        if (quick) {
            _cacheUsername(quick);
            return quick;
        }

        // 3. Passive wait — observe the DOM until YouTube hydrates the handle.
        //    No clicks, no side effects. Gives up after 10s.
        const observed = await _waitForHandleInDOM(10000);
        if (observed) {
            _cacheUsername(observed);
            return observed;
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

    // 2. ytInitialPlayerResponse / ytInitialData embedded in page
    try {
        const hdr = window.ytInitialData?.header?.c4TabbedHeaderRenderer;
        if (hdr?.channelHandleText?.runs?.[0]?.text) {
            return _normalizeHandle(hdr.channelHandleText.runs[0].text);
        }
    } catch (_) {}

    // 3. Polymer __data on topbar menu buttons
    const topbarBtns = document.querySelectorAll('ytd-topbar-menu-button-renderer');
    for (const btn of topbarBtns) {
        const candidates = [
            btn.__data?.data?.channelHandle,
            btn.__data?.channelHandle,
            btn.__data?.label,
        ];
        for (const val of candidates) {
            const h = _normalizeHandle(val);
            if (h) return h;
        }
    }

    // 4. Polymer data on the account manager (rendered but hidden)
    try {
        const accountMgr = document.querySelector('ytd-multi-page-menu-renderer');
        if (accountMgr?.__data) {
            const header = accountMgr.__data?.data?.header?.activeAccountHeaderRenderer;
            if (header?.channelHandle?.simpleText) {
                return _normalizeHandle(header.channelHandle.simpleText);
            }
        }
    } catch (_) {}

    // 5. Static DOM selectors (no menu interaction needed)
    const selectors = [
        'ytd-guide-entry-renderer[line-end-style="handle"] #guide-entry-title',
        'yt-formatted-string#channel-handle',
        '[id="channel-handle"]',
        '#avatar-channel-handle',
        'ytd-active-account-header-renderer #channel-handle',
        'ytd-active-account-header-renderer yt-formatted-string',
        'ytd-account-item-renderer #channel-handle',
        'tp-yt-paper-item #channel-handle',
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
function _waitForHandleInDOM(timeoutMs) {
    return new Promise(resolve => {
        let settled = false;
        let pollId;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearInterval(pollId);
            observer.disconnect();
            resolve(result);
        };

        const observer = new MutationObserver(() => {
            const h = _tryGetHandleFromDOM();
            if (h) finish(h);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        pollId = setInterval(() => {
            const h = _tryGetHandleFromDOM();
            if (h) finish(h);
        }, 1000);

        setTimeout(() => finish(null), timeoutMs);
    });
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