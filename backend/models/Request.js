const mongoose = require('mongoose');
const { ALL_CATEGORIES, DEFAULT_CATEGORY } = require('../config/constants');

const requestSchema = new mongoose.Schema({
    videoId:        { type: String, required: true },
    title:          { type: String, required: true },
    timestampStart: { type: String, default: '' },
    timestampEnd:   { type: String, default: '' },
    reason:         { type: String, default: '' },
    username:       { type: String, required: true },
    dateAdded:      { type: Date, default: Date.now },
    voteScore:      { type: Number, default: 0 },

    category:         { type: String, enum: ALL_CATEGORIES, default: DEFAULT_CATEGORY },
    categoryVerified: { type: Boolean, default: false },
    
    topics:           { type: [String], default: [] },
    
    verifiedBy:       { type: String, default: null },
    verifiedAt:       { type: Date, default: null },
});
// ── Indexes ───────────────────────────────────

// Primary sort index: list queries filter by videoId then sort by date.
requestSchema.index({ videoId: 1, dateAdded: -1 });

// Compound sort index: replaces the old single-field { videoId, voteScore } index.
requestSchema.index({ videoId: 1, voteScore: -1, dateAdded: -1 });

// Ownership index: speeds up findOneAndDelete({ videoId, username, _id }).
requestSchema.index({ videoId: 1, username: 1 });

// Category filter/aggregation index for the panel filter and dashboard.
requestSchema.index({ videoId: 1, category: 1 });

// Filter within given topic
requestSchema.index({ topics: 1, verifiedBy: 1 });

module.exports = mongoose.model('Request', requestSchema);
