const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    videoId:        { type: String, required: true },
    title:          { type: String, required: true },
    timestampStart: { type: String, default: '' },
    timestampEnd:   { type: String, default: '' },
    reason:         { type: String, default: '' },
    username:       { type: String, required: true },
    dateAdded:      { type: Date, default: Date.now },
    voteScore:      { type: Number, default: 0 },
});

// ── Indexes ───────────────────────────────────

// Primary sort index: list queries filter by videoId then sort by date.
requestSchema.index({ videoId: 1, dateAdded: -1 });

// Compound sort index: replaces the old single-field { videoId, voteScore } index.
requestSchema.index({ videoId: 1, voteScore: -1, dateAdded: -1 });

// Ownership index: speeds up findOneAndDelete({ videoId, username, _id }).
requestSchema.index({ videoId: 1, username: 1 });

module.exports = mongoose.model('Request', requestSchema);
