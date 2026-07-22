// ─────────────────────────────────────────────
// utils.js
// Pure utility functions — no DOM, no Chrome API
// ─────────────────────────────────────────────

/**
 * Format seconds into HH:MM:SS string
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
}

/**
 * Parse a HH:MM:SS timestamp string into total seconds
 * @param {string} timestamp
 * @returns {number}
 */
function parseTimestamp(timestamp) {
    if (!timestamp) return 0;
    return timestamp
        .split(':')
        .reverse()
        .reduce((acc, part, i) => acc + parseInt(part, 10) * Math.pow(60, i), 0);
}

/**
 * Validate start/end timestamps against each other and against video duration.
 * Throws a descriptive Error on failure.
 * @param {string} startTime  HH:MM:SS
 * @param {string} endTime    HH:MM:SS
 * @param {number} videoDuration  seconds
 * @returns {{ startSeconds: number, endSeconds: number }}
 */
function validateTimestamps(startTime, endTime, videoDuration) {
    const timestampRegex = /^([0-5][0-9]):([0-5][0-9]):([0-5][0-9])$/;

    if (!timestampRegex.test(startTime) || !timestampRegex.test(endTime)) {
        throw new Error('Please enter timestamps in the format HH:MM:SS (e.g., 00:15:30)');
    }

    const startSeconds = parseTimestamp(startTime);
    const endSeconds = parseTimestamp(endTime);

    if (startSeconds >= endSeconds) {
        throw new Error('Start timestamp must be less than end timestamp');
    }

    if (endSeconds > videoDuration) {
        throw new Error(`End timestamp cannot exceed video duration (${formatTime(Math.floor(videoDuration))})`);
    }

    return { startSeconds, endSeconds };
}

/**
 * Debounce a function call
 * @param {Function} func
 * @param {number} wait  ms
 * @returns {Function}
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Get the current YouTube video ID from the URL
 * @returns {string|null}
 */
function getCurrentVideoId() {
    return new URLSearchParams(window.location.search).get('v');
}

/**
 * Normalize a date string — returns a valid ISO string or today's ISO string as fallback
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
function normalizeDateAdded(dateStr) {
    if (!dateStr) return new Date().toISOString();
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date().toISOString() : dateStr;
}


function showToast(message, type = 'info', duration = 3000) {
    const existing = document.getElementById('cp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'cp-toast';
    toast.className = `cp-toast cp-toast--${type}`;
    // Errors are announced assertively (interrupts); everything else is
    // polite (waits for a pause) — screen readers previously got zero
    // feedback from toasts since neither attribute was ever set.
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('cp-toast--visible'));

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.remove('cp-toast--visible');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    }
}

// ── Shared accessible-dialog helpers ──────────
//
// Every custom modal in this codebase (confirm box, report dialog) built its
// own DOM with no dialog semantics, no focus trap, and no focus restoration —
// keyboard/screen-reader users could tab behind an "open" dialog and had no
// indication one was even open. These two helpers centralize the fix so any
// future dialog gets it for free instead of re-implementing it per call site.

let _cpDialogIdCounter = 0;
function _nextDialogId(prefix) {
    _cpDialogIdCounter += 1;
    return `${prefix}-${_cpDialogIdCounter}`;
}

const _CP_FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab/Shift+Tab focus cycling within `container` and routes Escape to
 * `onEscape`. Returns a cleanup function that removes the listener.
 */
function _trapFocus(container, { onEscape } = {}) {
    function getFocusable() {
        return Array.from(container.querySelectorAll(_CP_FOCUSABLE_SELECTOR))
            .filter(el => el.offsetParent !== null);
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            if (onEscape) { e.preventDefault(); onEscape(); }
            return;
        }
        if (e.key !== 'Tab') return;

        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    container.addEventListener('keydown', handleKeydown);
    return () => container.removeEventListener('keydown', handleKeydown);
}

/**
 * Wires standard accessible-dialog behavior onto an already-appended dialog
 * element: focus trap, Escape-to-close, and focus restoration to whatever
 * had focus before the dialog opened. `close` is called with no args by
 * Escape — callers whose close handler needs a "cancelled" result should
 * wrap it (see showConfirm below).
 */
function _wireDialogA11y(dialogEl, { onEscape, initialFocusEl } = {}) {
    const previouslyFocused = document.activeElement;
    const untrap = _trapFocus(dialogEl, { onEscape });

    (initialFocusEl || dialogEl.querySelector(_CP_FOCUSABLE_SELECTOR) || dialogEl).focus();

    return function restoreFocus() {
        untrap();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };
}

function showConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'cp-confirm-overlay';

        const messageId = _nextDialogId('cp-confirm-message');

        const box = document.createElement('div');
        box.className = 'cp-confirm-box';
        box.setAttribute('role', 'alertdialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', messageId);
        box.innerHTML = `
            <p class="cp-confirm-message" id="${messageId}">${_escapeHtml(message)}</p>
            <div class="cp-confirm-actions">
                <button class="cp-confirm-cancel">Cancel</button>
                <button class="cp-confirm-ok">Confirm</button>
            </div>
        `;

        document.body.append(overlay, box);

        const cancelBtn = box.querySelector('.cp-confirm-cancel');
        // Default focus goes to Cancel, not Confirm — showConfirm mainly
        // gates destructive actions (delete), so a stray Enter right after
        // open shouldn't be able to confirm one.
        const restoreFocus = _wireDialogA11y(box, {
            onEscape: () => cleanup(false),
            initialFocusEl: cancelBtn,
        });

        const cleanup = (result) => {
            restoreFocus();
            overlay.remove();
            box.remove();
            resolve(result);
        };

        box.querySelector('.cp-confirm-ok').addEventListener('click', () => cleanup(true));
        cancelBtn.addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', () => cleanup(false));
    });
}

// ── Theming Utilities ─────────────────────────

const AVAILABLE_THEMES = [
    { id: 'light', label: 'Light (Default)' },
    { id: 'dark', label: 'Dark Mode' },
    { id: 'dlsu', label: 'Archer Green' }
];

let _currentTheme = 'light';

/**
 * Applies a given theme by setting the data-cp-theme attribute on the root HTML element.
 * @param {string} themeName 
 */
function applyTheme(themeName) {
    const isLight = !themeName || themeName === 'light';
    _currentTheme = isLight ? 'light' : themeName;

    if (isLight) {
        document.documentElement.removeAttribute('data-cp-theme');
    } else {
        document.documentElement.setAttribute('data-cp-theme', themeName);
    }

    // Fallback: also apply to our injected panel explicitly if we are on YouTube
    // to bypass any aggressive DOM/CSS scrubbing by the host SPA
    const panel = document.getElementById('citation-controls');
    if (panel) {
        if (isLight) {
            panel.removeAttribute('data-cp-theme');
        } else {
            panel.setAttribute('data-cp-theme', themeName);
        }
    }
}

/**
 * Initializes the theme from storage and sets up a listener to sync changes.
 */
function initTheme() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // Initial load
        chrome.storage.local.get('theme', (res) => {
            applyTheme(res.theme || 'light');
        });

        // Listen for changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.theme) {
                applyTheme(changes.theme.newValue || 'light');
            }
        });
    }
}
