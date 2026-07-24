const router = require('express').Router();
const Report    = require('../models/Report');
const Citation  = require('../models/Citation');
const Request   = require('../models/Request');
const asyncHandler = require('../middleware/asyncHandler');

// POST /api/reports
router.post('/', asyncHandler(async (req, res) => {
    const { videoId, itemId, itemType, reason, additionalInfo, reporterUsername } = req.body;

    if (!videoId || !itemId || !itemType || !reason || !reporterUsername) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!['citation', 'request'].includes(itemType)) {
        return res.status(400).json({ success: false, error: 'itemType must be citation or request' });
    }
    if (typeof reason === 'string' && reason.length > 5000) {
        return res.status(400).json({ success: false, error: 'reason must be at most 5000 characters' });
    }
    if (additionalInfo && typeof additionalInfo === 'string' && additionalInfo.length > 5000) {
        return res.status(400).json({ success: false, error: 'additionalInfo must be at most 5000 characters' });
    }

    // Look up the reported item to check ownership and existence
    const Model = itemType === 'citation' ? Citation : Request;
    const item  = await Model.findById(itemId).select('username').lean();
    if (!item) {
        return res.status(404).json({ success: false, error: 'Reported item not found' });
    }

    // Self-report prevention
    if (item.username === reporterUsername) {
        return res.status(403).json({ success: false, error: 'You cannot report your own content' });
    }

    try {
        const report = await Report.create({
            videoId,
            itemId,
            itemType,
            reason,
            additionalInfo: additionalInfo || '',
            reporterUsername,
            timestamp: new Date(),
            status:    'pending',
        });

        res.status(201).json({ success: true, reportId: report._id });
    } catch (err) {
        // Duplicate report — unique index on { itemId, reporterUsername }
        if (err.code === 11000) {
            return res.status(409).json({ success: false, error: 'You have already reported this item' });
        }
        throw err;
    }
}));

module.exports = router;
