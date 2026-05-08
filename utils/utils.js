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
    const hrs  = Math.floor(seconds / 3600);
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
    const endSeconds   = parseTimestamp(endTime);

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
