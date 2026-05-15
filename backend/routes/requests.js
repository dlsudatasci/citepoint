const router = require('express').Router();
const Request = require('../models/Request');

// GET /api/requests/:videoId
router.get('/:videoId', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            Request.find({ videoId: req.params.videoId })
                .sort({ dateAdded: -1 })
                .skip(skip)
                .limit(limit),
            Request.countDocuments({ videoId: req.params.videoId }),
        ]);

        res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
        res.json({
            success: true,
            requests,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/requests/:videoId
router.post('/:videoId', async (req, res) => {
    try {
        const request = await Request.create({
            ...req.body,
            videoId: req.params.videoId,
            dateAdded: new Date(),
            voteScore: 0,
        });
        res.status(201).json({ success: true, id: request._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/requests/:videoId/:id
router.delete('/:videoId/:id', async (req, res) => {
    try {
        await Request.findOneAndDelete({ _id: req.params.id, videoId: req.params.videoId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/requests/:videoId/:id/vote  — body: { delta: number }
router.patch('/:videoId/:id/vote', async (req, res) => {
    try {
        const delta = Number(req.body.delta);
        if (!delta) return res.status(400).json({ success: false, error: 'delta is required' });
        const request = await Request.findOneAndUpdate(
            { _id: req.params.id, videoId: req.params.videoId },
            { $inc: { voteScore: delta } },
            { new: true }
        );
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
        res.json({ success: true, newScore: request.voteScore });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
