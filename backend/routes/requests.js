const router       = require('express').Router();
const Request      = require('../models/Request');
const Notification = require('../models/Notification');
const sseEmitter = require('../lib/sseEmitter');
const { ALL_CATEGORIES, DEFAULT_CATEGORY, TOPICS } = require('../config/constants');
const { isExpert } = require('../config/experts');
const { notifyExpertsForCategory } = require('../lib/notifyExperts');
const { notifyMentions } = require('../lib/mentions');
const { applyVote } = require('../lib/voting');
const { isValidVideoId, isValidTimestamp } = require('../lib/validators');
const { usernameMatches } = require('../lib/usernameMatches');
const asyncHandler = require('../middleware/asyncHandler');

// ── Validation helpers ────────────────────────

const MAX_TITLE_LEN  = 500;
const MAX_REASON_LEN = 5000;

// GET /api/requests/:videoId
router.get('/:videoId', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { videoId: req.params.videoId };
    if (req.query.category) {
        if (!ALL_CATEGORIES.includes(req.query.category)) {
            return res.status(400).json({ success: false, error: 'Invalid category' });
        }
        filter.category = req.query.category;
    }

    const [requests, total] = await Promise.all([
        Request.find(filter)
            .sort({ dateAdded: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Request.countDocuments(filter),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
        success: true,
        requests,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
}));

// GET /api/requests/:videoId/by-ids?ids=id1,id2,id3
// ─── IMPORTANT: must be defined BEFORE /:videoId/:id ───────────────────────
router.get('/:videoId/by-ids', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

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
}));

// GET /api/requests/:videoId/:id  — single-item detail
router.get('/:videoId/:id', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const request = await Request.findOne({
        _id:     req.params.id,
        videoId: req.params.videoId,
    }).lean();

    if (!request) {
        return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, request });
}));

// POST /api/requests/:videoId
router.post('/:videoId', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const { title, username, timestampStart, timestampEnd, reason, category } = req.body;

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
    if (category && !ALL_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const request = await Request.create({
        ...req.body,
        videoId:   req.params.videoId,
        dateAdded: new Date(),  // server-authoritative
        voteScore: 0,           // always start at zero
        category:  category || DEFAULT_CATEGORY,
        categoryVerified: false,
        verifiedBy: null,
        verifiedAt: null,
    });

    sseEmitter.emit(req.params.videoId, {
        type:      'requestAdded',
        videoId:   req.params.videoId,
        requestId: request._id.toString(),
    });

    notifyExpertsForCategory(request.category, {
        videoId: req.params.videoId,
        itemId: request._id.toString(),
        itemType: 'request',
        title: request.title,
        excludeUsername: request.username,
    });

    await notifyMentions({
        text:         reason,
        fromUsername: username,
        videoId:      req.params.videoId,
        itemId:       request._id.toString(),
        itemType:     'request',
        rootItemId:   request._id.toString(),
        rootItemType: 'request',
        title:        request.title,
    });

    res.status(201).json({ success: true, id: request._id });
}));

// DELETE /api/requests/:videoId/:id  — body: { username }
router.delete('/:videoId/:id', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'username is required' });
    }

    const result = await Request.findOneAndDelete({
        _id:     req.params.id,
        videoId: req.params.videoId,
        username: { $regex: new RegExp(`^@?${username.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (!result) {
        return res.status(403).json({ success: false, error: 'Not found or permission denied' });
    }

    // Remove all notifications tied to this request (direct item notifications + thread notifications)
    await Notification.deleteMany({
        $or: [
            { itemId: req.params.id },
            { rootItemId: req.params.id, rootItemType: 'request' },
        ],
    });

    sseEmitter.emit(req.params.videoId, {
        type:      'requestDeleted',
        videoId:   req.params.videoId,
        requestId: req.params.id,
    });

    res.json({ success: true });
}));

// PATCH /api/requests/:videoId/:id/vote  — body: { delta: number }
router.patch('/:videoId/:id/vote', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const delta = Number(req.body.delta);
    if (![-2, -1, 1, 2].includes(delta)) {
        return res.status(400).json({ success: false, error: 'delta must be -2, -1, 1, or 2' });
    }
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'username is required' });
    }

    const exists = await Request.exists({ _id: req.params.id, videoId: req.params.videoId });
    if (!exists) return res.status(404).json({ success: false, error: 'Request not found' });

    await applyVote(req.params.id, 'request', username, delta);

    const request = await Request.findOneAndUpdate(
        { _id: req.params.id, videoId: req.params.videoId },
        { $inc: { voteScore: delta } },
        { new: true }
    );

    sseEmitter.emit(req.params.videoId, {
        type:      'requestVoteUpdated',
        videoId:   req.params.videoId,
        requestId: req.params.id,
        voteScore: request.voteScore,
    });

    res.json({ success: true, newScore: request.voteScore });
}));

// PATCH /api/requests/:videoId/:id/category  — body: { category, username }
router.patch('/:videoId/:id/category', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const { category, username } = req.body;
    if (!category || !username) {
        return res.status(400).json({ success: false, error: 'category and username are required' });
    }
    if (!ALL_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const request = await Request.findOne({ _id: req.params.id, videoId: req.params.videoId });
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    const expert = isExpert(username);
    if (request.categoryVerified && !expert) {
        return res.status(403).json({ success: false, error: 'Only experts can change a verified category' });
    }

    request.category = category;
    if (expert) {
        request.categoryVerified = true;
        request.verifiedBy = username;
        request.verifiedAt = new Date();
    } else {
        request.categoryVerified = false;
        request.verifiedBy = null;
        request.verifiedAt = null;
    }
    await request.save();

    sseEmitter.emit(req.params.videoId, {
        type:             'requestCategoryUpdated',
        videoId:          req.params.videoId,
        requestId:        req.params.id,
        category:         request.category,
        categoryVerified: request.categoryVerified,
    });

    res.json({
        success: true,
        category: request.category,
        categoryVerified: request.categoryVerified,
        verifiedBy: request.verifiedBy,
    });
}));

// PATCH /api/requests/:videoId/:id/resolve  — body: { username, resolved }
// Restricted to the request's own author or an expert.
router.patch('/:videoId/:id/resolve', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const { username, resolved } = req.body;
    if (!username || typeof resolved !== 'boolean') {
        return res.status(400).json({ success: false, error: 'username and a boolean resolved are required' });
    }

    const request = await Request.findOne({ _id: req.params.id, videoId: req.params.videoId });
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    if (!usernameMatches(request.username, username) && !isExpert(username)) {
        return res.status(403).json({ success: false, error: 'Only the author or an expert can change resolved status' });
    }

    request.resolved   = resolved;
    request.resolvedBy = resolved ? username : null;
    request.resolvedAt = resolved ? new Date() : null;
    await request.save();

    sseEmitter.emit(req.params.videoId, {
        type:      'requestResolvedUpdated',
        videoId:   req.params.videoId,
        requestId: req.params.id,
        resolved:  request.resolved,
    });

    res.json({
        success:    true,
        resolved:   request.resolved,
        resolvedBy: request.resolvedBy,
        resolvedAt: request.resolvedAt,
    });
}));

module.exports = router;
