// ─────────────────────────────────────────────
// username.js
// YouTube username/handle detection.
//
// On current YouTube builds, the signed-in handle isn't exposed anywhere
// "passive" (yt.config_.CHANNEL_HANDLE, ytInitialData, and the topbar
// button's internal data have all been confirmed empty) — it only exists
// in the DOM while the account-switcher dropdown is open. So detection
// tries the cheap passive read first (in case that ever changes), then
// falls back to briefly opening that dropdown, reading the handle, and
// closing it again — once per fresh page load, not on every call, so
// switching YouTube accounts and reloading the page picks up the new
// identity without flashing the menu open on every poll tick.
// ─────────────────────────────────────────────

// Reset to false on every real page load (content scripts re-initialize
// fresh) — guards the menu-click fallback so it runs at most once per load.
let _didActiveHandleCheckThisLoad = false;

/**
 * Attempt to get the signed-in YouTube handle (@username).
 * Returns null if not logged in or handle cannot be found.
 * @returns {Promise<string|null>}
 */
async function getYouTubeUsername() {
    try {
        const cached = await getCachedUsername();
        const onYouTube = location.hostname?.includes('youtube.com');

        if (onYouTube) {
            // Cheap, synchronous passive read — cross-checked against the cache
            // (not trusted blindly) so an account switch is picked up instead of
            // sticking to whichever handle was cached first.
            const quick = _tryGetHandleFromDOM();
            if (quick) {
                if (quick !== cached) _cacheUsername(quick);
                return quick;
            }

            // Active fallback — the passive sources above are confirmed empty on
            // current YouTube builds, so the only remaining way to read the real
            // handle is to open the account-switcher dropdown. Runs at most once
            // per fresh page load (see _didActiveHandleCheckThisLoad above).
            if (!_didActiveHandleCheckThisLoad) {
                _didActiveHandleCheckThisLoad = true;
                const viaMenu = await _tryGetHandleViaMenuClick();
                if (viaMenu) {
                    if (viaMenu !== cached) _cacheUsername(viaMenu);
                    return viaMenu;
                }
            }
        }

        // 1. Cache — works on any page (extension pages, or YouTube pages where
        //    every detection method above came up empty).
        if (cached) {
            return cached;
        }

        // 2. If not on YouTube and nothing cached, DOM detection isn't possible.
        if (!onYouTube) {
            console.log('[username] Not on YouTube and no cached handle — user must visit YouTube first');
            return null;
        }

        // 3. Passive wait — observe the DOM in case the handle becomes available
        //    some other way (e.g., YouTube hydrating late). No clicks. Gives up
        //    after 10s. Last resort, since the menu-click fallback above already
        //    covers the case this was originally meant for.
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
 * Return cached username from localStorage.
 * @returns {Promise<string|null>}
 */
async function getCachedUsername() {
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

// Buttons that open YouTube's account-switcher dropdown, tried in order.
const _AVATAR_BUTTON_SELECTORS = [
    '#avatar-btn',
    'button[aria-label="Account menu"]',
    'ytd-topbar-menu-button-renderer button[aria-haspopup="true"]',
];

// Where the handle actually lives once that dropdown is open.
const _MENU_HANDLE_SELECTOR = 'yt-formatted-string#channel-handle, ytd-active-account-header-renderer #channel-handle';

function _findAvatarButton() {
    for (const sel of _AVATAR_BUTTON_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
    }
    return null;
}

function _readMenuHandle() {
    const el = document.querySelector(_MENU_HANDLE_SELECTOR);
    return _normalizeHandle(el?.getAttribute('title') || el?.textContent);
}

/**
 * Briefly opens YouTube's account-switcher dropdown to read the signed-in
 * handle (the only place it currently exists in the DOM — see the file
 * header), then closes it again the same way it was opened. Resolves within
 * ~2s or null if the button can't be found or the handle never appears.
 */
function _tryGetHandleViaMenuClick() {
    return new Promise(resolve => {
        // Already open for some other reason (e.g. the user has it open
        // themselves) — just read it, no need to click anything.
        const existing = _readMenuHandle();
        if (existing) { resolve(existing); return; }

        const btn = _findAvatarButton();
        if (!btn) { resolve(null); return; }

        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            clearTimeout(timeoutId);
            btn.click(); // close it again
            resolve(result);
        };

        const observer = new MutationObserver(() => {
            const h = _readMenuHandle();
            if (h) finish(h);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        const timeoutId = setTimeout(() => finish(null), 2000);

        btn.click(); // open it
    });
}

/**
 * Passively observe the DOM until YouTube hydrates the handle into one of
 * the sources _tryGetHandleFromDOM() checks. No clicks, no side effects —
 * see _tryGetHandleViaMenuClick() for the active fallback that actually
 * opens the account menu. Kept as a last resort in case a future YouTube
 * build exposes the handle passively again.
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

function _cacheUsername(handle) {
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