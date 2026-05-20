const router = require('express').Router();
const Citation = require('../models/Citation');

// GET /api/citations/:videoId
router.get('/:videoId', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [citations, total] = await Promise.all([
            Citation.find({ videoId: req.params.videoId })
                .sort({ dateAdded: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Citation.countDocuments({ videoId: req.params.videoId }),
        ]);

        res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
        res.json({
            success: true,
            citations,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/citations/:videoId
router.post('/:videoId', async (req, res) => {
    try {
        const { citationTitle, username } = req.body;
        if (!citationTitle || !username) {
            return res.status(400).json({ success: false, error: 'citationTitle and username are required' });
        }

        const citation = await Citation.create({
            ...req.body,
            videoId:  req.params.videoId,
            dateAdded: new Date(),  // server-authoritative — overrides any client-supplied value
            voteScore: 0,           // always start at zero regardless of body
        });
        res.status(201).json({ success: true, id: citation._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/citations/:videoId/:id  — body: { username }
router.delete('/:videoId/:id', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, error: 'username is required' });
        }

        const result = await Citation.findOneAndDelete({
            _id:     req.params.id,
            videoId: req.params.videoId,
            username,              // ownership check — only the author can delete
        });

        if (!result) {
            return res.status(403).json({ success: false, error: 'Not found or permission denied' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/citations/:videoId/:id/vote  — body: { delta: number }
router.patch('/:videoId/:id/vote', async (req, res) => {
    try {
        const delta = Number(req.body.delta);
        // Valid deltas: ±1 (new vote or toggle), ±2 (switching from opposite vote)
        if (![-2, -1, 1, 2].includes(delta)) {
            return res.status(400).json({ success: false, error: 'delta must be -2, -1, 1, or 2' });
        }

        const citation = await Citation.findOneAndUpdate(
            { _id: req.params.id, videoId: req.params.videoId },
            { $inc: { voteScore: delta } },
            { new: true }
        );
        if (!citation) return res.status(404).json({ success: false, error: 'Citation not found' });
        res.json({ success: true, newScore: citation.voteScore });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
