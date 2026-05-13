const router = require('express').Router();
const Citation = require('../models/Citation');

// GET /api/citations/:videoId
router.get('/:videoId', async (req, res) => {
    try {
        const citations = await Citation.find({ videoId: req.params.videoId })
            .sort({ dateAdded: -1 });
        res.json({ success: true, citations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/citations/:videoId
router.post('/:videoId', async (req, res) => {
    try {
        const citation = await Citation.create({
            ...req.body,
            videoId: req.params.videoId,
            timestamp: new Date(),
            voteScore: 0,
        });
        res.status(201).json({ success: true, id: citation._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/citations/:videoId/:id
router.delete('/:videoId/:id', async (req, res) => {
    try {
        await Citation.findOneAndDelete({ _id: req.params.id, videoId: req.params.videoId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/citations/:videoId/:id/vote  — body: { delta: number }
router.patch('/:videoId/:id/vote', async (req, res) => {
    try {
        const delta = Number(req.body.delta);
        if (!delta) return res.status(400).json({ success: false, error: 'delta is required' });
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
