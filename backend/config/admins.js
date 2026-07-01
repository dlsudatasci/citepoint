// Hardcoded admin allowlist. Add usernames via the ADMIN_USERNAMES env var
// (comma-separated) for local/deployment configuration without code changes.
const DEFAULT_ADMINS = [];

const ADMIN_USERNAMES = new Set([
    ...DEFAULT_ADMINS,
    ...(process.env.ADMIN_USERNAMES
        ? process.env.ADMIN_USERNAMES.split(',').map(s => s.trim()).filter(Boolean)
        : []),
]);

function isAdmin(username) {
    return typeof username === 'string' && ADMIN_USERNAMES.has(username);
}

module.exports = { ADMIN_USERNAMES, isAdmin };
