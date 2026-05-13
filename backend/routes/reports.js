const router = require('express').Router();
const Report = require('../models/Report');

// POST /api/reports
router.post('/', async (req, res) => {
    try {
        const { videoId, itemId, itemType, reason, additionalInfo } = req.body;
        if (!videoId || !itemId || !itemType || !reason) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const report = await Report.create({
            videoId, itemId, itemType, reason,
            additionalInfo: additionalInfo || '',
            timestamp: new Date(),
            status: 'pending',
        });
        res.status(201).json({ success: true, reportId: report._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
