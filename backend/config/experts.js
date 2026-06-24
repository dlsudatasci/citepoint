// Hardcoded expert allowlist. Add usernames via the EXPERT_USERNAMES env var
// (comma-separated) for local/deployment configuration without code changes.
const DEFAULT_EXPERTS = [];

const EXPERT_USERNAMES = new Set([
    ...DEFAULT_EXPERTS,
    ...(process.env.EXPERT_USERNAMES
        ? process.env.EXPERT_USERNAMES.split(',').map(s => s.trim()).filter(Boolean)
        : []),
]);

function isExpert(username) {
    return typeof username === 'string' && EXPERT_USERNAMES.has(username);
}

module.exports = { EXPERT_USERNAMES, isExpert };
