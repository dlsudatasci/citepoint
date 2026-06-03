const router     = require('express').Router();
const Request    = require('../models/Request');
const sseEmitter = require('../lib/sseEmitter');

// ── Validation helpers ────────────────────────

const YOUTUBE_ID_RE  = /^[a-zA-Z0-9_-]{1,64}$/;
const TIMESTAMP_RE   = /^\d{1,2}:\d{2}(:\d{2})?$/;
const MAX_TITLE_LEN  = 500;
const MAX_REASON_LEN = 5000;

function isValidVideoId(id) {
    return typeof id === 'string' && YOUTUBE_ID_RE.test(id);
}

function isValidTimestamp(ts) {
    return !ts || TIMESTAMP_RE.test(ts);
}

// GET /api/requests/:videoId
router.get('/:videoId', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
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

        res.set('Cache-Control', 'no-store');
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
router.get('/:videoId/by-ids', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const raw = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
        if (raw.length === 0) {
            return res.json({ success: true, requests: [] });
        }

        const ids = [...new Set(raw)].slice(0, 50);

        const requests = await Request.find({
            videoId: req.params.videoId,
            _id:     { $in: ids },
        }).lean();

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/requests/:videoId/:id  — single-item detail
router.get('/:videoId/:id', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const request = await Request.findOne({
            _id:     req.params.id,
            videoId: req.params.videoId,
        }).lean();

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, request });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/requests/:videoId
router.post('/:videoId', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const { title, username, timestampStart, timestampEnd, reason } = req.body;

        if (!title || !username) {
            return res.status(400).json({ success: false, error: 'title and username are required' });
        }
        if (typeof title === 'string' && title.length > MAX_TITLE_LEN) {
            return res.status(400).json({ success: false, error: `title must be at most ${MAX_TITLE_LEN} characters` });
        }
        if (!isValidTimestamp(timestampStart) || !isValidTimestamp(timestampEnd)) {
            return res.status(400).json({ success: false, error: 'Timestamps must be in HH:MM or HH:MM:SS format' });
        }
        if (reason && reason.length > MAX_REASON_LEN) {
            return res.status(400).json({ success: false, error: `reason must be at most ${MAX_REASON_LEN} characters` });
        }

        const request = await Request.create({
            ...req.body,
            videoId:   req.params.videoId,
            dateAdded: new Date(),  // server-authoritative
            voteScore: 0,           // always start at zero
        });

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
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, error: 'username is required' });
        }

        const result = await Request.findOneAndDelete({
            _id:     req.params.id,
            videoId: req.params.videoId,
            username,
        });

        if (!result) {
            return res.status(403).json({ success: false, error: 'Not found or permission denied' });
        }

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
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const delta = Number(req.body.delta);
        if (![-2, -1, 1, 2].includes(delta)) {
            return res.status(400).json({ success: false, error: 'delta must be -2, -1, 1, or 2' });
        }

        const request = await Request.findOneAndUpdate(
            { _id: req.params.id, videoId: req.params.videoId },
            { $inc: { voteScore: delta } },
            { new: true }
        );
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

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