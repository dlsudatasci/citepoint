const mongoose = require('mongoose');
const { ALL_CATEGORIES, DEFAULT_CATEGORY } = require('../config/categories');

const citationSchema = new mongoose.Schema({
    videoId:        { type: String, required: true },
    citationTitle:  { type: String, required: true },
    timestampStart: { type: String, default: '' },
    timestampEnd:   { type: String, default: '' },
    description:    { type: String, default: '' },
    source:         { type: String, default: '' },
    username:       { type: String, required: true },
    dateAdded:      { type: Date, default: Date.now },
    voteScore:      { type: Number, default: 0 },
    requestId:         { type: String, default: null },
    parentCitationId:  { type: String, default: null },
    category:         { type: String, enum: ALL_CATEGORIES, default: DEFAULT_CATEGORY },
    categoryVerified: { type: Boolean, default: false },
    verifiedBy:       { type: String, default: null },
    verifiedAt:       { type: Date, default: null },
});

// ── Indexes ───────────────────────────────────

// Primary sort index: all list queries filter by videoId then sort by date.
// This is the most frequently used index.
citationSchema.index({ videoId: 1, dateAdded: -1 });

// Compound sort index: covers sort-by-voteScore with dateAdded as tiebreak.
// Replaces the old single-field { videoId, voteScore } index.
// Also enables future server-side sort-by-score endpoint without a new index.
citationSchema.index({ videoId: 1, voteScore: -1, dateAdded: -1 });

// Ownership index: speeds up findOneAndDelete({ videoId, username, _id })
// used for author-only deletion checks.
citationSchema.index({ videoId: 1, username: 1 });

// Category filter/aggregation index for the panel filter and dashboard.
citationSchema.index({ videoId: 1, category: 1 });

module.exports = mongoose.model('Citation', citationSchema);
