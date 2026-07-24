const router   = require('express').Router();
const Citation = require('../models/Citation');
const Request  = require('../models/Request');
const { ALL_CATEGORIES, DEFAULT_CATEGORY } = require('../config/constants');
const sseEmitter = require('../lib/sseEmitter');
const { resolveRootId, notifyOnReply } = require('../lib/threads');
const { notifyMentions } = require('../lib/mentions');
const asyncHandler = require('../middleware/asyncHandler');

const MAX_TREE_DEPTH = 6;
const MAX_DESC_LEN   = 5000;

// Fetches the entire reply thread in a single query — every node in a thread shares
// the same rootId (see backend/models/Citation.js) — then assembles the subtree
// descending from `citation` in memory, instead of one DB round trip per tree node
// (previously up to MAX_TREE_DEPTH round trips deep).
async function buildTree(citation, maxDepth = MAX_TREE_DEPTH) {
    const threadRootId = citation.rootId || citation._id.toString();
    const nodes = await Citation.find({ rootId: threadRootId })
        .sort({ dateAdded: 1 })
        .lean();

    const childrenByParent = new Map();
    for (const node of nodes) {
        node.id = node._id.toString();
        if (!node.parentCitationId) continue;
        if (!childrenByParent.has(node.parentCitationId)) {
            childrenByParent.set(node.parentCitationId, []);
        }
        childrenByParent.get(node.parentCitationId).push(node);
    }

    function attach(nodeId, depth) {
        if (depth >= maxDepth) return [];
        const kids = childrenByParent.get(nodeId) || [];
        kids.forEach(kid => { kid.children = attach(kid.id, depth + 1); });
        return kids;
    }

    return attach(citation._id.toString(), 0);
}

// GET /api/discussion/citation/:id — thread for a citation
// Add ?tree=true for nested tree structure (used by discussion page)
router.get('/citation/:id', asyncHandler(async (req, res) => {
    const citation = await Citation.findById(req.params.id).lean();
    if (!citation) return res.status(404).json({ success: false, error: 'Citation not found' });
    citation.id = citation._id.toString();

    let replies;
    if (req.query.tree === 'true') {
        replies = await buildTree(citation);
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

    await notifyMentions({
        text:         description,
        fromUsername: username,
        videoId:      parent.videoId,
        itemId:       reply._id.toString(),
        itemType:     'citation',
        rootItemId:   rootId,
        rootItemType: 'citation',
        title:        parent.citationTitle,
    });

    res.status(201).json({ success: true, id: reply._id.toString() });
}));

module.exports = router;
