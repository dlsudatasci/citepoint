const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    videoId:          { type: String, required: true, index: true },
    itemId:           { type: String, required: true },
    itemType:         { type: String, required: true, enum: ['citation', 'request'] },
    reason:           { type: String, required: true },
    additionalInfo:   { type: String, default: '' },
    reporterUsername: { type: String, required: true },
    timestamp:        { type: Date, default: Date.now },
    status:           { type: String, default: 'pending', enum: ['pending', 'reviewed', 'dismissed'] },
});

// Prevent the same user from reporting the same item twice
reportSchema.index({ itemId: 1, reporterUsername: 1 }, { unique: true });

// Moderation / admin queries: "all reports for a video" or "all reports by a user"
reportSchema.index({ videoId: 1, reporterUsername: 1 });

module.exports = mongoose.model('Report', reportSchema);
