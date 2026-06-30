const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    videoId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
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

videoSchema.index({ videoId: 1 });

module.exports = mongoose.model('Video', videoSchema);