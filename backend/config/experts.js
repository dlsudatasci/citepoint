// config/experts.js

// Hardcoded expert domain mapping. 
// Instead of a simple array, we map usernames to their specialized Topics.
const DEFAULT_EXPERTS = {
};


const expertRegistry = { ...DEFAULT_EXPERTS };

if (process.env.EXPERT_CONFIG) {
    const entries = process.env.EXPERT_CONFIG.split('|');
    entries.forEach(entry => {
        const [username, topicsStr] = entry.split(':');
        if (username && topicsStr) {
            expertRegistry[username.trim()] = topicsStr.split(',').map(t => t.trim());
        }
    });
}


function isExpert(username, topic = null) {
    if (typeof username !== 'string' || !expertRegistry[username]) {
        return false;
    }
    
    if (topic) {
        return expertRegistry[username].includes(topic);
    }
    
    return true; 
}

function getExpertTopics(username) {
    return expertRegistry[username] || [];
}

module.exports = { isExpert, getExpertTopics, expertRegistry };