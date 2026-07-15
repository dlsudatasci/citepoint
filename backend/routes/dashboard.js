const router   = require('express').Router();
const Citation = require('../models/Citation');
const Request  = require('../models/Request');
const { isValidVideoId } = require('../lib/validators');

async function countByCategory(Model, filter) {
    const rows = await Model.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);
    return rows.map(r => ({ category: r._id, count: r.count }));
}

async function verificationStats(Model, filter) {
    const rows = await Model.aggregate([
        { $match: filter },
        { $group: { _id: { category: '$category', verified: '$categoryVerified' }, count: { $sum: 1 } } },
    ]);

    const byCategory = {};
    for (const row of rows) {
        const { category, verified } = row._id;
        if (!byCategory[category]) byCategory[category] = { category, verified: 0, unverified: 0 };
        if (verified) byCategory[category].verified += row.count;
        else byCategory[category].unverified += row.count;
    }
    return Object.values(byCategory).sort((a, b) =>
        (b.verified + b.unverified) - (a.verified + a.unverified)
    );
}

// GET /api/dashboard/trending  — optional ?videoId= to scope to one video
router.get('/trending', async (req, res) => {
    try {
        const filter = {};
        if (req.query.videoId) {
            if (!isValidVideoId(req.query.videoId)) {
                return res.status(400).json({ success: false, error: 'Invalid videoId' });
            }
            filter.videoId = req.query.videoId;
        }

        const [requestsByCategory, citationsByCategory, citationVerification, requestVerification] = await Promise.all([
            countByCategory(Request, filter),
            countByCategory(Citation, filter),
            verificationStats(Citation, filter),
            verificationStats(Request, filter),
        ]);

        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            requestsByCategory,
            citationsByCategory,
            verificationStats: {
                citations: citationVerification,
                requests: requestVerification,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
