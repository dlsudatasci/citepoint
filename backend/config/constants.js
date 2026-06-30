// config/constants.js

// separation of citation CATEGORY (what the claim is) vs TOPIC (what the claim is about)

const CATEGORIES = [
    'Statistics & Data',
    'Quote / Misattribution',
    'Historical Claim',
    'Scientific Claim',
    'Context / Methodology',
    'Other',
];

const DEFAULT_CATEGORY = 'Uncategorized';
const ALL_CATEGORIES = [...CATEGORIES, DEFAULT_CATEGORY];


const TOPICS = [
    'Science & Technology',
    'History',
    'Politics & News',
    'Education',
    'Health & Fitness',
    'Economics',
    'Philosophy',
    'Entertainment'
];

module.exports = { 
    CATEGORIES, 
    DEFAULT_CATEGORY, 
    ALL_CATEGORIES,
    TOPICS 
};