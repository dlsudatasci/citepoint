// config/experts.js

const { TOPICS } = require('./constants');

const _normalize = u => typeof u === 'string' ? u.replace(/^@/, '').toLowerCase() : '';

// Hardcoded expert domain mapping — keys are normalized (no @, lowercase).
const DEFAULT_EXPERTS = {
    'andreidominicviguilla': TOPICS,
};

const expertRegistry = {};

Object.entries(DEFAULT_EXPERTS).forEach(([u, topics]) => {
    expertRegistry[u] = topics;
});

if (process.env.EXPERT_CONFIG) {
    const entries = process.env.EXPERT_CONFIG.split('|');
    entries.forEach(entry => {
        const [username, topicsStr] = entry.split(':');
        if (username && topicsStr) {
            expertRegistry[_normalize(username)] = topicsStr.split(',').map(t => t.trim());
        }
    });
}

function isExpert(username, topic = null) {
    const key = _normalize(username);
    if (!key || !expertRegistry[key]) return false;
    if (topic) return expertRegistry[key].includes(topic);
    return true;
}

function getExpertTopics(username) {
    return expertRegistry[_normalize(username)] || [];
}

module.exports = { isExpert, getExpertTopics, expertRegistry };