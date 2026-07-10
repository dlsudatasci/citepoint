const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { mapRawTagsToTopics } = require('../utils/topicMapper');

// ── POST /api/videos/upsert ─────────────────────────────
router.post('/upsert', async (req, res) => {
    try {
        const { videoId, title, channelName, thumbnailUrl, rawTags } = req.body;

        if (!videoId || !title) {
            return res.status(400).json({ success: false, error: 'videoId and title are required' });
        }

        const cleanTopics = mapRawTagsToTopics(rawTags);

        const video = await Video.findOneAndUpdate(
            { videoId },
            {
                $set: {
                    title,
                    channelName: channelName || '',
                    thumbnailUrl: thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    youtubeTopics: cleanTopics,
                    lastUpdated: Date.now()
                }
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, data: video });

    } catch (error) {
        console.error('Video upsert error:', error);
        res.status(500).json({ success: false, error: 'Server error during video upsert' });
    }
});

module.exports = router;