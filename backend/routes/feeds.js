const router = require('express').Router();
const Request = require('../models/Request');
const Expert = require('../models/Expert');

// ── GET /api/feeds/general ───────────────────
router.get('/general', async (req, res) => {
    try {
        const { topic, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const pipeline = [
            {
                $lookup: {
                    from: 'videos',
                    localField: 'videoId',
                    foreignField: 'videoId',
                    as: 'videoDoc'
                }
            },
            { $unwind: { path: '$videoDoc', preserveNullAndEmptyArrays: true } },
            
            {
                $addFields: {
                    video: {
                        title: '$videoDoc.title',
                        thumbnailUrl: '$videoDoc.thumbnailUrl',
                        videoId: '$videoId'
                    },
                    topics: { $ifNull: ['$videoDoc.youtubeTopics', []] } 
                }
            }
        ];

        if (topic !== undefined && topic !== 'All') {
            if (typeof topic !== 'string') {
                return res.status(400).json({ success: false, error: 'Invalid topic' });
            }
            pipeline.push({ $match: { topics: topic } });
        }

        pipeline.push({ $sort: { voteScore: -1, dateAdded: -1 } });
        pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

        const feed = await Request.aggregate(pipeline);

        res.json({ success: true, data: feed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── GET /api/feeds/expert ────────────────────
router.get('/expert', async (req, res) => {
    try {
        const { username } = req.query;
        if (typeof username !== 'string' || !username.trim()) {
            return res.status(400).json({ success: false, error: 'Username required' });
        }

        const expert = await Expert.findOne({ username });
        if (!expert || !expert.topics || expert.topics.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const pipeline = [
            {
                $lookup: {
                    from: 'videos',
                    localField: 'videoId',
                    foreignField: 'videoId',
                    as: 'videoDoc'
                }
            },
            { $unwind: { path: '$videoDoc', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    video: {
                        title: '$videoDoc.title',
                        thumbnailUrl: '$videoDoc.thumbnailUrl',
                        videoId: '$videoId'
                    },
                    topics: { $ifNull: ['$videoDoc.youtubeTopics', []] }
                }
            },
            { $match: { topics: { $in: expert.topics } } },
            { $sort: { voteScore: -1, dateAdded: -1 } },
            { $limit: 50 } 
        ];

        const feed = await Request.aggregate(pipeline);
        res.json({ success: true, data: feed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;