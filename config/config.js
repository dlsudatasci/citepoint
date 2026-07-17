// config.js
//
// The real runtime API base is derived from manifest.json's host_permissions —
// see content/api.js's _CP_API_BASE and background/background.js's own
// API_BASE_URL. This file only holds the category/topic taxonomy shared globals.

var CATEGORIES = [
    'Statistics & Data',
    'Quote / Misattribution',
    'Historical Claim',
    'Scientific Claim',
    'Context / Methodology',
    'Other',
];

var DEFAULT_CATEGORY = 'Uncategorized';
var ALL_CATEGORIES = [...CATEGORIES, DEFAULT_CATEGORY];

// Single source of truth for category badge colors — content/citations.js and
// src/dashboard/components/Analytics.jsx both read this global instead of keeping
// their own copies (they used to, and drifted: this file's hex values must match
// styles/tokens.css's --cp-cat-* custom properties, or a contrast fix landed in one
// place silently stops applying in the other).
var CATEGORY_COLORS = {
    'Statistics & Data':      { bg: 'rgba(101, 31, 255, 0.12)', color: '#651fff' },
    'Quote / Misattribution': { bg: 'rgba(179, 64, 0, 0.12)',   color: '#b34000' },
    'Historical Claim':       { bg: 'rgba(0, 137, 123, 0.12)',  color: '#00897b' },
    'Scientific Claim':       { bg: 'rgba(6, 95, 212, 0.12)',   color: '#065fd4' },
    'Context / Methodology':  { bg: 'rgba(194, 24, 91, 0.12)',  color: '#c2185b' },
    'Other':                  { bg: 'rgba(0, 0, 0, 0.07)',      color: '#606060' },
    'Uncategorized':          { bg: 'rgba(0, 0, 0, 0.05)',      color: '#9e9e9e' },
};

function categoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS[DEFAULT_CATEGORY];
}


var TOPICS = [
    'Science & Technology',
    'History',
    'Politics & News',
    'Education',
    'Health & Fitness',
    'Economics',
    'Philosophy',
    'Entertainment'
];