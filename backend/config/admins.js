// Hardcoded admin allowlist. Add usernames via the ADMIN_USERNAMES env var
// (comma-separated) for local/deployment configuration without code changes.
const DEFAULT_ADMINS = [];

// Strip @ so env var works with or without the prefix (e.g. c1t3p01nt or @c1t3p01nt).
const _normalize = u => u.replace(/^@/, '').toLowerCase();

const ADMIN_USERNAMES = new Set([
    ...DEFAULT_ADMINS,
    ...(process.env.ADMIN_USERNAMES
        ? process.env.ADMIN_USERNAMES.split(',').map(s => _normalize(s.trim())).filter(Boolean)
        : []),
]);

function isAdmin(username) {
    return typeof username === 'string' && ADMIN_USERNAMES.has(_normalize(username));
}

module.exports = { ADMIN_USERNAMES, isAdmin };
