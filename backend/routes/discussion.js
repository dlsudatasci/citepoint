const router   = require('express').Router();
const Citation = require('../models/Citation');
const Request  = require('../models/Request');
const { ALL_CATEGORIES, DEFAULT_CATEGORY } = require('../config/categories');

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
router.get('/citation/:id', async (req, res) => {
    try {
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
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/discussion/request/:id — thread for a request
router.get('/request/:id', async (req, res) => {
    try {
        const request = await Request.findById(req.params.id).lean();
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
        request.id = request._id.toString();

        const responses = await Citation.find({ requestId: req.params.id })
            .sort({ dateAdded: -1 })
            .lean();
        responses.forEach(r => { r.id = r._id.toString(); });

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, request, responses });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/discussion/reply — lightweight reply (inherits parent metadata)
router.post('/reply', async (req, res) => {
    try {
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
            category:         parent.category || DEFAULT_CATEGORY,
            categoryVerified: false,
            dateAdded:        new Date(),
            voteScore:        0,
        });

        res.status(201).json({ success: true, id: reply._id.toString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
