const router      = require('express').Router();
const UserProfile = require('../models/UserProfile');
const Citation    = require('../models/Citation');
const Request     = require('../models/Request');
const Expert      = require('../models/Expert');
const { ALL_CATEGORIES } = require('../config/categories');

const MAX_DISPLAY_NAME_LEN = 100;
const MAX_FOLLOWED_CATEGORIES = ALL_CATEGORIES.length;

// Case-insensitive, '@'-prefix-tolerant username match — same convention used
// for ownership checks elsewhere in the backend.
function usernameMatches(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}

// GET /api/profile/:username
router.get('/:username', async (req, res) => {
    try {
        const username = req.params.username;

        const [profile, expert, citationCount, requestCount, totalUpvotes] = await Promise.all([
            UserProfile.findOne({ username }).lean(),
            Expert.findOne({ username }).lean(),
            Citation.countDocuments({ username }),
            Request.countDocuments({ username }),
            Citation.aggregate([
                { $match: { username } },
                { $group: { _id: null, total: { $sum: '$voteScore' } } },
            ]),
        ]);

        const upvotes = totalUpvotes.length > 0 ? totalUpvotes[0].total : 0;

        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            profile: profile || { username, displayName: '', bio: '', followedCategories: [] },
            stats: { citations: citationCount, requests: requestCount, upvotes },
            expert: expert ? { categories: expert.categories } : null,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/profile/:username
router.put('/:username', async (req, res) => {
    try {
        if (!usernameMatches(req.params.username, req.body.requesterUsername)) {
            return res.status(403).json({ success: false, error: 'You can only edit your own profile' });
        }

        const { displayName, bio, followedCategories } = req.body;

        if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > MAX_DISPLAY_NAME_LEN)) {
            return res.status(400).json({ success: false, error: `displayName must be at most ${MAX_DISPLAY_NAME_LEN} characters` });
        }
        if (followedCategories !== undefined) {
            if (!Array.isArray(followedCategories) || followedCategories.length > MAX_FOLLOWED_CATEGORIES
                || !followedCategories.every(c => ALL_CATEGORIES.includes(c))) {
                return res.status(400).json({ success: false, error: 'followedCategories must be an array of valid category names' });
            }
        }

        const profile = await UserProfile.findOneAndUpdate(
            { username: req.params.username },
            { displayName, bio, followedCategories },
            { upsert: true, new: true }
        );

        res.json({ success: true, profile });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/profile/:username/history — citation + request history
router.get('/:username/history', async (req, res) => {
    try {
        const username = req.params.username;
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [citations, requests] = await Promise.all([
            Citation.find({ username }).sort({ dateAdded: -1 }).skip(skip).limit(limit).lean(),
            Request.find({ username }).sort({ dateAdded: -1 }).skip(skip).limit(limit).lean(),
        ]);

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, citations, requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
