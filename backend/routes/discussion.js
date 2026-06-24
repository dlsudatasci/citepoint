const router   = require('express').Router();
const Citation = require('../models/Citation');
const Request  = require('../models/Request');

// GET /api/discussion/citation/:id — full thread for a citation
router.get('/citation/:id', async (req, res) => {
    try {
        const citation = await Citation.findById(req.params.id).lean();
        if (!citation) return res.status(404).json({ success: false, error: 'Citation not found' });

        const replies = await Citation.find({ parentCitationId: req.params.id })
            .sort({ dateAdded: -1 })
            .lean();

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, citation, replies });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/discussion/request/:id — full thread for a request
router.get('/request/:id', async (req, res) => {
    try {
        const request = await Request.findById(req.params.id).lean();
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

        const responses = await Citation.find({ requestId: req.params.id })
            .sort({ dateAdded: -1 })
            .lean();

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, request, responses });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
