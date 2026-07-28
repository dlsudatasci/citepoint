const router       = require('express').Router();
const Report       = require('../models/Report');
const Citation     = require('../models/Citation');
const Request      = require('../models/Request');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const { isAdmin }  = require('../config/admins');

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

// GET /api/reports/locked?videoId=... — returns itemIds with pending reports (used to lock delete buttons)
router.get('/locked', asyncHandler(async (req, res) => {
    const { videoId } = req.query;
    if (!videoId) return res.status(400).json({ success: false, error: 'videoId required' });
    const lockedIds = await Report.find({ videoId, status: 'pending' }).distinct('itemId');
    res.json({ success: true, lockedIds });
}));

// GET /api/reports/pending?adminUsername=... — admin: list pending reports
router.get('/pending', asyncHandler(async (req, res) => {
    if (!isAdmin(req.query.adminUsername)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const reports = await Report.find({ status: 'pending' })
        .sort({ timestamp: -1 })
        .lean();
    res.json({ success: true, reports });
}));

// PATCH /api/reports/:id — admin: mark reviewed or dismissed
router.patch('/:id', asyncHandler(async (req, res) => {
    const { status, adminUsername } = req.body;
    if (!isAdmin(adminUsername)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    if (!['reviewed', 'dismissed'].includes(status)) {
        return res.status(400).json({ success: false, error: 'status must be reviewed or dismissed' });
    }
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, report });
}));

// POST /api/reports/:id/takedown — admin: delete the reported item and notify its owner
router.post('/:id/takedown', asyncHandler(async (req, res) => {
    const { adminUsername } = req.body;
    if (!isAdmin(adminUsername)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    const Model = report.itemType === 'citation' ? Citation : Request;
    const item  = await Model.findById(report.itemId).select('username citationTitle title videoId').lean();

    if (item) {
        await Model.findByIdAndDelete(report.itemId);

        // Notify the content owner
        const itemTitle = item.citationTitle || item.title || 'Your content';
        await Notification.create({
            username:  item.username,
            type:      'content_removed',
            videoId:   item.videoId || report.videoId,
            itemId:    report.itemId,
            itemType:  report.itemType,
            title:     `Your ${report.itemType} "${itemTitle}" was removed for violating community guidelines.`,
        });

        // Mark all pending reports for this item as reviewed
        await Report.updateMany({ itemId: report.itemId, status: 'pending' }, { status: 'reviewed' });
    } else {
        // Item already gone — just mark the report reviewed
        await Report.findByIdAndUpdate(req.params.id, { status: 'reviewed' });
    }

    res.json({ success: true });
}));

module.exports = router;
