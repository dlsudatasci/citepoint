const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { mapRawTagsToTopics } = require('../utils/topicMapper');
const { isValidVideoId } = require('../lib/validators');

const MAX_TITLE_LEN   = 500;
const MAX_CHANNEL_LEN = 200;
const MAX_URL_LEN     = 2048;

// ── POST /api/videos/upsert ─────────────────────────────
router.post('/upsert', async (req, res) => {
    try {
        const { videoId, title, channelName, thumbnailUrl, rawTags } = req.body;

        if (!isValidVideoId(videoId)) {
            return res.status(400).json({ success: false, error: 'Invalid videoId' });
        }
        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ success: false, error: 'title is required' });
        }
        if (title.length > MAX_TITLE_LEN) {
            return res.status(400).json({ success: false, error: `title must be at most ${MAX_TITLE_LEN} characters` });
        }
        if (channelName !== undefined && (typeof channelName !== 'string' || channelName.length > MAX_CHANNEL_LEN)) {
            return res.status(400).json({ success: false, error: `channelName must be a string of at most ${MAX_CHANNEL_LEN} characters` });
        }
        if (thumbnailUrl !== undefined && (typeof thumbnailUrl !== 'string' || thumbnailUrl.length > MAX_URL_LEN)) {
            return res.status(400).json({ success: false, error: `thumbnailUrl must be a string of at most ${MAX_URL_LEN} characters` });
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