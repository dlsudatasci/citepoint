const router   = require('express').Router();
const Citation = require('../models/Citation');
const Request  = require('../models/Request');
const { ALL_CATEGORIES, DEFAULT_CATEGORY } = require('../config/categories');
const sseEmitter = require('../lib/sseEmitter');
const { resolveRootId, notifyOnReply } = require('../lib/threads');
const asyncHandler = require('../middleware/asyncHandler');

const MAX_TREE_DEPTH = 6;
const MAX_DESC_LEN   = 5000;

async function buildTree(rootId, maxDepth = MAX_TREE_DEPTH, currentDepth = 0) {
    if (currentDepth >= maxDepth) return [];
    const children = await Citation.find({ parentCitationId: rootId })
        .sort({ dateAdded: 1 })
        .lean();
    for (const child of children) {
        child.id = child._id.toString();
        child.children = await buildTree(child._id.toString(), maxDepth, currentDepth + 1);
    }
    return children;
}

// GET /api/discussion/citation/:id — thread for a citation
// Add ?tree=true for nested tree structure (used by discussion page)
router.get('/citation/:id', asyncHandler(async (req, res) => {
    const citation = await Citation.findById(req.params.id).lean();
    if (!citation) return res.status(404).json({ success: false, error: 'Citation not found' });
    citation.id = citation._id.toString();

    let replies;
    if (req.query.tree === 'true') {
        replies = await buildTree(req.params.id);
    } else {
        replies = await Citation.find({ parentCitationId: req.params.id })
            .sort({ dateAdded: -1 })
            .lean();
        replies.forEach(r => { r.id = r._id.toString(); });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, citation, replies });
}));

// GET /api/discussion/request/:id — thread for a request
router.get('/request/:id', asyncHandler(async (req, res) => {
    const request = await Request.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    request.id = request._id.toString();

    const responses = await Citation.find({ requestId: req.params.id })
        .sort({ dateAdded: -1 })
        .lean();
    responses.forEach(r => { r.id = r._id.toString(); });

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, request, responses });
}));

// POST /api/discussion/reply — lightweight reply (inherits parent metadata)
router.post('/reply', asyncHandler(async (req, res) => {
    const { parentCitationId, description, username } = req.body;

    if (!parentCitationId || !description || !username) {
        return res.status(400).json({ success: false, error: 'parentCitationId, description, and username are required' });
    }
    if (description.length > MAX_DESC_LEN) {
        return res.status(400).json({ success: false, error: `description must be at most ${MAX_DESC_LEN} characters` });
    }

    const parent = await Citation.findById(parentCitationId).lean();
    if (!parent) {
        return res.status(404).json({ success: false, error: 'Parent citation not found' });
    }

    const rootId = await resolveRootId(parent);

    // videoId is always derived from the parent citation — never trust the client's
    // value here, or replies can be filed under an unrelated/bogus video (see audit F-4).
    const reply = await Citation.create({
        videoId: parent.videoId,
        citationTitle:    parent.citationTitle,
        timestampStart:   parent.timestampStart,
        timestampEnd:     parent.timestampEnd,
        description,
        source:           '',
        username,
        parentCitationId,
        rootId,
        category:         parent.category || DEFAULT_CATEGORY,
        categoryVerified: false,
        dateAdded:        new Date(),
        voteScore:        0,
    });

    sseEmitter.emit(parent.videoId, {
        type:       'citationAdded',
        videoId:    parent.videoId,
        citationId: reply._id.toString(),
    });

    await notifyOnReply({
        toUsername:   parent.username,
        fromUsername: username,
        itemId:       reply._id.toString(),
        itemType:     'citation',
        rootItemId:   rootId,
        rootItemType: 'citation',
        videoId:      parent.videoId,
        title:        parent.citationTitle,
    });

    res.status(201).json({ success: true, id: reply._id.toString() });
}));

module.exports = router;
