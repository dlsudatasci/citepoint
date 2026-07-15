const router      = require('express').Router();
const Citation    = require('../models/Citation');
const sseEmitter  = require('../lib/sseEmitter');
const { ALL_CATEGORIES, DEFAULT_CATEGORY, TOPICS } = require('../config/constants');
const { isExpert } = require('../config/experts');
const { notifyExpertsForCategory } = require('../lib/notifyExperts');
const { applyVote } = require('../lib/voting');
const { isValidVideoId, isValidTimestamp, isSafeSourceUrl } = require('../lib/validators');

// ── Validation helpers ────────────────────────

const MAX_TITLE_LEN  = 500;
const MAX_DESC_LEN   = 5000;
const MAX_SOURCE_LEN = 2048;

// GET /api/citations/:videoId
router.get('/:videoId', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
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

        const [citations, total] = await Promise.all([
            Citation.find(filter)
                .sort({ dateAdded: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Citation.countDocuments(filter),
        ]);

        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            citations,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/citations/:videoId/:id  — single-item detail
router.get('/:videoId/:id', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const citation = await Citation.findOne({
            _id:     req.params.id,
            videoId: req.params.videoId,
        }).lean();

        if (!citation) {
            return res.status(404).json({ success: false, error: 'Citation not found' });
        }

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, citation });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/citations/:videoId
router.post('/:videoId', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const { citationTitle, username, timestampStart, timestampEnd, description, source, category } = req.body;

        if (!citationTitle || !username) {
            return res.status(400).json({ success: false, error: 'citationTitle and username are required' });
        }
        if (typeof citationTitle === 'string' && citationTitle.length > MAX_TITLE_LEN) {
            return res.status(400).json({ success: false, error: `citationTitle must be at most ${MAX_TITLE_LEN} characters` });
        }
        if (!isValidTimestamp(timestampStart) || !isValidTimestamp(timestampEnd)) {
            return res.status(400).json({ success: false, error: 'Timestamps must be in HH:MM or HH:MM:SS format' });
        }
        if (description && description.length > MAX_DESC_LEN) {
            return res.status(400).json({ success: false, error: `description must be at most ${MAX_DESC_LEN} characters` });
        }
        if (source && source.length > MAX_SOURCE_LEN) {
            return res.status(400).json({ success: false, error: `source URL must be at most ${MAX_SOURCE_LEN} characters` });
        }
        if (!isSafeSourceUrl(source)) {
            return res.status(400).json({ success: false, error: 'source must be a valid http(s) URL' });
        }
        if (category && !ALL_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Invalid category' });
        }

        const citation = await Citation.create({
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
            type:       'citationAdded',
            videoId:    req.params.videoId,
            citationId: citation._id.toString(),
        });

        notifyExpertsForCategory(citation.category, {
            videoId: req.params.videoId,
            itemId: citation._id.toString(),
            itemType: 'citation',
            title: citation.citationTitle,
            excludeUsername: citation.username,
        });

        res.status(201).json({ success: true, id: citation._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/citations/:videoId/:id  — body: { username }
router.delete('/:videoId/:id', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, error: 'username is required' });
        }

        const result = await Citation.findOneAndDelete({
            _id:     req.params.id,
            videoId: req.params.videoId,
            username: { $regex: new RegExp(`^@?${username.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });

        if (!result) {
            return res.status(403).json({ success: false, error: 'Not found or permission denied' });
        }

        sseEmitter.emit(req.params.videoId, {
            type:       'citationDeleted',
            videoId:    req.params.videoId,
            citationId: req.params.id,
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/citations/:videoId/:id/vote  — body: { delta: number }
router.patch('/:videoId/:id/vote', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const delta = Number(req.body.delta);
        if (![-2, -1, 1, 2].includes(delta)) {
            return res.status(400).json({ success: false, error: 'delta must be -2, -1, 1, or 2' });
        }
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, error: 'username is required' });
        }

        const exists = await Citation.exists({ _id: req.params.id, videoId: req.params.videoId });
        if (!exists) return res.status(404).json({ success: false, error: 'Citation not found' });

        // Verifies the delta is a legal transition from this user's recorded vote state
        // (server-side, not client-trusted) before applying it — closes repeated-call
        // vote inflation, since a second identical vote is no longer a legal transition.
        await applyVote(req.params.id, 'citation', username, delta);

        const citation = await Citation.findOneAndUpdate(
            { _id: req.params.id, videoId: req.params.videoId },
            { $inc: { voteScore: delta } },
            { new: true }
        );

        sseEmitter.emit(req.params.videoId, {
            type:       'citationVoteUpdated',
            videoId:    req.params.videoId,
            citationId: req.params.id,
            voteScore:  citation.voteScore,
        });

        res.json({ success: true, newScore: citation.voteScore });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

// PATCH /api/citations/:videoId/:id/category  — body: { category, username }
router.patch('/:videoId/:id/category', async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    try {
        const { category, username } = req.body;
        if (!category || !username) {
            return res.status(400).json({ success: false, error: 'category and username are required' });
        }
        if (!ALL_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Invalid category' });
        }

        const citation = await Citation.findOne({ _id: req.params.id, videoId: req.params.videoId });
        if (!citation) return res.status(404).json({ success: false, error: 'Citation not found' });

        const expert = isExpert(username);
        if (citation.categoryVerified && !expert) {
            return res.status(403).json({ success: false, error: 'Only experts can change a verified category' });
        }

        citation.category = category;
        if (expert) {
            citation.categoryVerified = true;
            citation.verifiedBy = username;
            citation.verifiedAt = new Date();
        } else {
            citation.categoryVerified = false;
            citation.verifiedBy = null;
            citation.verifiedAt = null;
        }
        await citation.save();

        sseEmitter.emit(req.params.videoId, {
            type:             'citationCategoryUpdated',
            videoId:          req.params.videoId,
            citationId:       req.params.id,
            category:         citation.category,
            categoryVerified: citation.categoryVerified,
        });

        res.json({
            success: true,
            category: citation.category,
            categoryVerified: citation.categoryVerified,
            verifiedBy: citation.verifiedBy,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;