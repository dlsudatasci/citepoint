const router       = require('express').Router();
const Notification = require('../models/Notification');
const Citation     = require('../models/Citation');
const Request      = require('../models/Request');
const asyncHandler = require('../middleware/asyncHandler');
const { usernameMatches } = require('../lib/usernameMatches');

// GET /api/notifications/:username
router.get('/:username', asyncHandler(async (req, res) => {
    // Lazy cleanup: remove notifications whose referenced item was deleted
    const candidates = await Notification.find({
        username: req.params.username,
        itemId:   { $ne: null },
        itemType: { $in: ['citation', 'request'] },
    }).select('_id itemId itemType').lean();

    if (candidates.length) {
        const citationCandidates = candidates.filter(n => n.itemType === 'citation');
        const requestCandidates  = candidates.filter(n => n.itemType === 'request');

        const [existingCitationIds, existingRequestIds] = await Promise.all([
            citationCandidates.length
                ? Citation.find({ _id: { $in: citationCandidates.map(n => n.itemId) } }).distinct('_id')
                : Promise.resolve([]),
            requestCandidates.length
                ? Request.find({ _id: { $in: requestCandidates.map(n => n.itemId) } }).distinct('_id')
                : Promise.resolve([]),
        ]);

        const existingCitations = new Set(existingCitationIds.map(id => id.toString()));
        const existingRequests  = new Set(existingRequestIds.map(id => id.toString()));

        const staleIds = candidates
            .filter(n =>
                (n.itemType === 'citation' && !existingCitations.has(n.itemId)) ||
                (n.itemType === 'request'  && !existingRequests.has(n.itemId))
            )
            .map(n => n._id);

        if (staleIds.length) {
            await Notification.deleteMany({ _id: { $in: staleIds } });
        }
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [notifications, unreadCount] = await Promise.all([
        Notification.find({ username: req.params.username })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Notification.countDocuments({ username: req.params.username, read: false }),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, notifications, unreadCount });
}));

// PATCH /api/notifications/:id/read
router.patch('/:id/read', asyncHandler(async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'username is required' });
    }

    const notification = await Notification.findById(req.params.id).lean();
    if (!notification) {
        return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    if (!usernameMatches(notification.username, username)) {
        return res.status(403).json({ success: false, error: 'You do not own this notification' });
    }

    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
}));

// PATCH /api/notifications/:username/read-all
router.patch('/:username/read-all', asyncHandler(async (req, res) => {
    if (!usernameMatches(req.params.username, req.body.username)) {
        return res.status(403).json({ success: false, error: 'You can only mark your own notifications as read' });
    }

    await Notification.updateMany({ username: req.params.username, read: false }, { read: true });
    res.json({ success: true });
}));

module.exports = router;
