const router       = require('express').Router();
const Citation     = require('../models/Citation');
const Request      = require('../models/Request');
const Notification = require('../models/Notification');
const sseEmitter   = require('../lib/sseEmitter');
const { ALL_CATEGORIES, DEFAULT_CATEGORY, TOPICS } = require('../config/constants');
const { isExpert } = require('../config/experts');
const { notifyExpertsForCategory } = require('../lib/notifyExperts');
const { applyVote } = require('../lib/voting');
const { isValidVideoId, isValidTimestamp, isSafeSourceUrl } = require('../lib/validators');
const { resolveRootId, notifyOnReply } = require('../lib/threads');
const { usernameMatches } = require('../lib/usernameMatches');
const { notifyMentions } = require('../lib/mentions');
const asyncHandler = require('../middleware/asyncHandler');

// ── Validation helpers ────────────────────────

const MAX_TITLE_LEN  = 500;
const MAX_DESC_LEN   = 5000;
const MAX_SOURCE_LEN = 2048;

// GET /api/citations/:videoId
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
}));

// GET /api/citations/:videoId/:id  — single-item detail
router.get('/:videoId/:id', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const citation = await Citation.findOne({
        _id:     req.params.id,
        videoId: req.params.videoId,
    }).lean();

    if (!citation) {
        return res.status(404).json({ success: false, error: 'Citation not found' });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, citation });
}));

// POST /api/citations/:videoId
router.post('/:videoId', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const { citationTitle, username, timestampStart, timestampEnd, description, source, category, parentCitationId, requestId } = req.body;

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

    // Reply-to-citation and respond-to-request are mutually exclusive (see
    // content/forms.js's respondWithCitation) — resolve whichever parent is present
    // so we can both notify its author and inherit/compute the thread's rootId.
    let parentCitation = null;
    if (parentCitationId) {
        parentCitation = await Citation.findById(parentCitationId).lean();
        if (!parentCitation) {
            return res.status(404).json({ success: false, error: 'Parent citation not found' });
        }
    }

    let parentRequest = null;
    if (requestId) {
        parentRequest = await Request.findById(requestId).lean();
        if (!parentRequest) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }
    }

    const citation = new Citation({
        ...req.body,
        videoId:   req.params.videoId,
        dateAdded: new Date(),  // server-authoritative
        voteScore: 0,           // always start at zero
        category:  category || DEFAULT_CATEGORY,
        categoryVerified: false,
        verifiedBy: null,
        verifiedAt: null,
    });
    citation.rootId = parentCitation ? await resolveRootId(parentCitation) : citation._id.toString();
    await citation.save();

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

    if (parentCitation) {
        await notifyOnReply({
            toUsername:   parentCitation.username,
            fromUsername: username,
            itemId:       citation._id.toString(),
            itemType:     'citation',
            rootItemId:   citation.rootId,
            rootItemType: 'citation',
            videoId:      req.params.videoId,
            title:        parentCitation.citationTitle,
        });
    } else if (parentRequest) {
        await notifyOnReply({
            toUsername:   parentRequest.username,
            fromUsername: username,
            itemId:       citation._id.toString(),
            itemType:     'citation',
            rootItemId:   requestId,
            rootItemType: 'request',
            videoId:      req.params.videoId,
            title:        parentRequest.title,
        });
    }

    await notifyMentions({
        text:         description,
        fromUsername: username,
        videoId:      req.params.videoId,
        itemId:       citation._id.toString(),
        itemType:     'citation',
        rootItemId:   citation.rootId,
        rootItemType: 'citation',
        title:        citation.citationTitle,
    });

    res.status(201).json({ success: true, id: citation._id });
}));

// DELETE /api/citations/:videoId/:id  — body: { username }
router.delete('/:videoId/:id', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

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

    // Cascade-delete all nested replies to this citation (they share rootId = this citation's _id)
    const nestedReplies = await Citation.find({ rootId: req.params.id }).select('_id').lean();
    if (nestedReplies.length) {
        const nestedIds = nestedReplies.map(r => r._id.toString());
        await Citation.deleteMany({ _id: { $in: nestedIds } });
        await Notification.deleteMany({ itemId: { $in: nestedIds } });
    }

    // Remove all notifications tied to this citation (direct item + thread notifications)
    await Notification.deleteMany({
        $or: [
            { itemId: req.params.id },
            { rootItemId: req.params.id, rootItemType: 'citation' },
        ],
    });

    sseEmitter.emit(req.params.videoId, {
        type:       'citationDeleted',
        videoId:    req.params.videoId,
        citationId: req.params.id,
    });

    res.json({ success: true });
}));

// PATCH /api/citations/:videoId/:id/vote  — body: { delta: number }
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
}));

// PATCH /api/citations/:videoId/:id/category  — body: { category, username }
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
}));

// PATCH /api/citations/:videoId/:id/resolve  — body: { username, resolved }
// Marks a citation (or a reply thread's root) resolved/unresolved. Restricted to the
// citation's own author or an expert — mirrors the category-verification ownership
// model, not the DELETE route's regex-based owner match, since this only ever
// compares against the single already-fetched document, not a query filter.
router.patch('/:videoId/:id/resolve', asyncHandler(async (req, res) => {
    if (!isValidVideoId(req.params.videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid videoId' });
    }

    const { username, resolved } = req.body;
    if (!username || typeof resolved !== 'boolean') {
        return res.status(400).json({ success: false, error: 'username and a boolean resolved are required' });
    }

    const citation = await Citation.findOne({ _id: req.params.id, videoId: req.params.videoId });
    if (!citation) return res.status(404).json({ success: false, error: 'Citation not found' });

    if (!usernameMatches(citation.username, username) && !isExpert(username)) {
        return res.status(403).json({ success: false, error: 'Only the author or an expert can change resolved status' });
    }

    citation.resolved   = resolved;
    citation.resolvedBy = resolved ? username : null;
    citation.resolvedAt = resolved ? new Date() : null;
    await citation.save();

    sseEmitter.emit(req.params.videoId, {
        type:       'citationResolvedUpdated',
        videoId:    req.params.videoId,
        citationId: req.params.id,
        resolved:   citation.resolved,
    });

    res.json({
        success:     true,
        resolved:    citation.resolved,
        resolvedBy:  citation.resolvedBy,
        resolvedAt:  citation.resolvedAt,
    });
}));

module.exports = router;