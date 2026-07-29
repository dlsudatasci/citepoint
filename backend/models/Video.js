const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    videoId: {
        type: String,
        required: true,
        unique: true
    },
    title: { 
        type: String, 
        required: true 
    },
    thumbnailUrl: { 
        type: String, 
        default: '' 
    },
    channelName: { 
        type: String, 
        default: '' 
    },
    youtubeTopics: [{ 
        type: String 
    }],
    lastUpdated: { 
        type: Date, 
        default: Date.now 
    }
});

// videoId's index is already created by `unique: true` above.

module.exports = mongoose.model('Video', videoSchema);