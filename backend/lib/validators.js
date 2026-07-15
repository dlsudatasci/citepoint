const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const TIMESTAMP_RE  = /^\d{1,2}:\d{2}(:\d{2})?$/;

function isValidVideoId(id) {
    return typeof id === 'string' && YOUTUBE_ID_RE.test(id);
}

function isValidTimestamp(ts) {
    return !ts || (typeof ts === 'string' && TIMESTAMP_RE.test(ts));
}

// Only http(s) is an acceptable source URL scheme — rejects javascript:,
// data:, and other schemes a renderer could later execute if it forgot to
// re-check the scheme itself (defense in depth alongside client-side checks).
function isSafeSourceUrl(url) {
    if (!url) return true; // source is optional
    if (typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

module.exports = { YOUTUBE_ID_RE, TIMESTAMP_RE, isValidVideoId, isValidTimestamp, isSafeSourceUrl };
