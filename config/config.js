// config.js

var API_BASE_URL = "http://altdsidccf.dlsu.edu.ph:15020/api";


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