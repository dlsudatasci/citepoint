// Case-insensitive, '@'-prefix-tolerant username comparison — the standard
// ownership-check convention used across every route that compares a
// client-supplied username against a stored one.
function usernameMatches(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}

module.exports = { usernameMatches };
