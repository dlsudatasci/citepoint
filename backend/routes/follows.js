const router      = require('express').Router();
const Citation     = require('../models/Citation');
const Request      = require('../models/Request');
const Follow       = require('../models/Follow');
const asyncHandler = require('../middleware/asyncHandler');

const ITEM_MODELS = { citation: Citation, request: Request };

// GET /api/follows/:itemType/:itemId?username= — current follow state, for
// rendering the Follow/Unfollow button on initial load.
router.get('/:itemType/:itemId', asyncHandler(async (req, res) => {
    const { itemType, itemId } = req.params;
    const { username } = req.query;

    if (!ITEM_MODELS[itemType]) {
        return res.status(400).json({ success: false, error: 'itemType must be citation or request' });
    }
    if (!username) {
        return res.status(400).json({ success: false, error: 'username is required' });
    }

    const following = await Follow.exists({ itemId, itemType, username });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, following: !!following });
}));

// PATCH /api/follows/:itemType/:itemId — { username, following } toggles follow
// state. Idempotent: following an already-followed item (or unfollowing an
// already-unfollowed one) is a no-op, not an error — mirrors the resolve-status
// toggle route's shape (backend/routes/citations.js's PATCH .../resolve).
router.patch('/:itemType/:itemId', asyncHandler(async (req, res) => {
    const { itemType, itemId } = req.params;
    const Model = ITEM_MODELS[itemType];

    if (!Model) {
        return res.status(400).json({ success: false, error: 'itemType must be citation or request' });
    }
    const { username, following } = req.body;
    if (!username || typeof following !== 'boolean') {
        return res.status(400).json({ success: false, error: 'username and a boolean following are required' });
    }

    const exists = await Model.exists({ _id: itemId });
    if (!exists) return res.status(404).json({ success: false, error: `${itemType} not found` });

    if (following) {
        await Follow.findOneAndUpdate(
            { itemId, itemType, username },
            { itemId, itemType, username },
            { upsert: true }
        );
    } else {
        await Follow.deleteOne({ itemId, itemType, username });
    }

    res.json({ success: true, following });
}));

module.exports = router;
