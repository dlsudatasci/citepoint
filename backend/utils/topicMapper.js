const { TOPICS } = require('../config/constants');

// mapping raw YouTube keywords/genres to our official TOPICS
const KEYWORD_MAP = {
    'science': 'Science & Technology',
    'physics': 'Science & Technology',
    'technology': 'Science & Technology',
    'programming': 'Science & Technology',
    'history': 'History',
    'politics': 'Politics & News',
    'news': 'Politics & News',
    'education': 'Education',
    'fitness': 'Health & Fitness',
    'health': 'Health & Fitness',
    'workout': 'Health & Fitness',
    'economics': 'Economics',
    'finance': 'Economics',
    'philosophy': 'Philosophy',
    'entertainment': 'Entertainment',
    'gaming': 'Entertainment',
    'video games': 'Entertainment'
};

function mapRawTagsToTopics(rawTags = []) {
    const matchedTopics = new Set();

    rawTags.forEach(tag => {
        const normalizedTag = tag.toLowerCase().trim();
        
        if (KEYWORD_MAP[normalizedTag]) {
            matchedTopics.add(KEYWORD_MAP[normalizedTag]);
            return;
        }

        for (const [key, topic] of Object.entries(KEYWORD_MAP)) {
            if (normalizedTag.includes(key)) {
                matchedTopics.add(topic);
            }
        }
    });

    return Array.from(matchedTopics);
}

module.exports = { mapRawTagsToTopics };