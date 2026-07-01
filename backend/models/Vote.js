const mongoose = require('mongoose');

// Tracks which way (if any) each user has voted on a given item, so the server
// — not the client — is the source of truth for whether a vote transition is legal.
const voteSchema = new mongoose.Schema({
    itemId:    { type: String, required: true },
    itemType:  { type: String, enum: ['citation', 'request'], required: true },
    username:  { type: String, required: true },
    voteType:  { type: String, enum: ['up', 'down'], required: true },
    updatedAt: { type: Date, default: Date.now },
});

voteSchema.index({ itemId: 1, itemType: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
