const mongoose = require('mongoose');

// Tracks which threads a user wants to follow, independent of authorship or
// participation — mirrors Vote's shape (backend/models/Vote.js) since both are
// simple per-user, per-item toggle state with the same uniqueness constraint.
const followSchema = new mongoose.Schema({
    itemId:    { type: String, required: true },
    itemType:  { type: String, enum: ['citation', 'request'], required: true },
    username:  { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

followSchema.index({ itemId: 1, itemType: 1, username: 1 }, { unique: true });
followSchema.index({ username: 1 });

module.exports = mongoose.model('Follow', followSchema);
