const router     = require('express').Router();
const Request    = require('../models/Request');
const sseEmitter = require('../lib/sseEmitter');

// GET /api/requests/:videoId
router.get('/:videoId', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        // Reduced from 200 → 50 to match citations and avoid over-fetching (#9)
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            Request.find({ videoId: req.params.videoId })
                .sort({ dateAdded: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
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

// GET /api/requests/:videoId/by-ids?ids=id1,id2,id3
// ─── IMPORTANT: must be defined BEFORE /:videoId/:id ───────────────────────
// Fetches only the specific request IDs needed to render response-citation
// groups on the Citations tab.  Replaces the old blanket 200-item fetch (#1).
router.get('/:videoId/by-ids', async (req, res) => {
    try {
        const raw = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
        if (raw.length === 0) {
            return res.json({ success: true, requests: [] });
        }

        // Cap at 50 IDs to prevent abuse; deduplication happens on the caller side too
        const ids = [...new Set(raw)].slice(0, 50);

        const requests = await Request.find({
            videoId: req.params.videoId,
            _id:     { $in: ids },
        }).lean();

        res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/requests/:videoId/:id  — single-item detail
router.get('/:videoId/:id', async (req, res) => {
    try {
        const request = await Request.findOne({
            _id:     req.params.id,
            videoId: req.params.videoId,
        }).lean();

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
        res.json({ success: true, request });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/requests/:videoId
router.post('/:videoId', async (req, res) => {
    try {
        const { title, username } = req.body;
        if (!title || !username) {
            return res.status(400).json({ success: false, error: 'title and username are required' });
        }

        const request = await Request.create({
            ...req.body,
            videoId:   req.params.videoId,
            dateAdded: new Date(),  // server-authoritative
            voteScore: 0,           // always start at zero
        });

        // Notify all SSE clients watching this video
        sseEmitter.emit(req.params.videoId, {
            type:      'requestAdded',
            videoId:   req.params.videoId,
            requestId: request._id.toString(),
        });

        res.status(201).json({ success: true, id: request._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/requests/:videoId/:id  — body: { username }
router.delete('/:videoId/:id', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, error: 'username is required' });
        }

        const result = await Request.findOneAndDelete({
            _id:     req.params.id,
            videoId: req.params.videoId,
            username,              // ownership check — only the author can delete
        });

        if (!result) {
            return res.status(403).json({ success: false, error: 'Not found or permission denied' });
        }

        // Notify all SSE clients watching this video
        sseEmitter.emit(req.params.videoId, {
            type:      'requestDeleted',
            videoId:   req.params.videoId,
            requestId: req.params.id,
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/requests/:videoId/:id/vote  — body: { delta: number }
router.patch('/:videoId/:id/vote', async (req, res) => {
    try {
        const delta = Number(req.body.delta);
        // Valid deltas: ±1 (new vote or toggle), ±2 (switching from opposite vote)
        if (![-2, -1, 1, 2].includes(delta)) {
            return res.status(400).json({ success: false, error: 'delta must be -2, -1, 1, or 2' });
        }

        const request = await Request.findOneAndUpdate(
            { _id: req.params.id, videoId: req.params.videoId },
            { $inc: { voteScore: delta } },
            { new: true }
        );
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

        // Notify all SSE clients with the authoritative new score
        sseEmitter.emit(req.params.videoId, {
            type:      'requestVoteUpdated',
            videoId:   req.params.videoId,
            requestId: req.params.id,
            voteScore: request.voteScore,
        });

        res.json({ success: true, newScore: request.voteScore });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
