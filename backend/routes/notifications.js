const router       = require('express').Router();
const Notification = require('../models/Notification');

// GET /api/notifications/:username
router.get('/:username', async (req, res) => {
    try {
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
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/notifications/:username/read-all
router.patch('/:username/read-all', async (req, res) => {
    try {
        await Notification.updateMany({ username: req.params.username, read: false }, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
