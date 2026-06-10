// Shared category taxonomy for citations and requests.
// Keep this list in sync with `config/categories.js` in the extension.
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

module.exports = { CATEGORIES, DEFAULT_CATEGORY, ALL_CATEGORIES };
