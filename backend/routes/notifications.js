const router       = require('express').Router();
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');

// Case-insensitive, '@'-prefix-tolerant username match — same convention used
// for ownership checks in citations.js/requests.js.
function usernameMatches(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}

// GET /api/notifications/:username
router.get('/:username', asyncHandler(async (req, res) => {
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
