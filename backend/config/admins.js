// Hardcoded admin allowlist. Add usernames via the ADMIN_USERNAMES env var
// (comma-separated) for local/deployment configuration without code changes.
const DEFAULT_ADMINS = [];

// Strip @ so env var works with or without the prefix (e.g. c1t3p01nt or @c1t3p01nt).
const _normalize = u => u.replace(/^@/, '').toLowerCase();
// Canonical form with @ prefix, preserving original case — used for notification delivery.
const _canonical = u => u.startsWith('@') ? u : `@${u}`;

const _rawAdmins = [
    ...DEFAULT_ADMINS,
    ...(process.env.ADMIN_USERNAMES
        ? process.env.ADMIN_USERNAMES.split(',').map(s => s.trim()).filter(Boolean)
        : []),
];

const ADMIN_USERNAMES = new Set(_rawAdmins.map(_normalize));
// Original usernames with @ prefix for notification targeting.
const ADMIN_USERNAMES_CANONICAL = _rawAdmins.map(_canonical);

function isAdmin(username) {
    return typeof username === 'string' && ADMIN_USERNAMES.has(_normalize(username));
}

module.exports = { ADMIN_USERNAMES, ADMIN_USERNAMES_CANONICAL, isAdmin };
