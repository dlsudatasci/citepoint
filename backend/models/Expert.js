const mongoose = require('mongoose');
const { TOPICS } = require('../config/constants'); 

const expertSchema = new mongoose.Schema({
    username:   { type: String, required: true, unique: true },
    topics:     [{ type: String, enum: TOPICS }], // Uses TOPICS from constants
    grantedAt:  { type: Date, default: Date.now },
    grantedBy:  { type: String, default: null },
});

expertSchema.index({ username: 1 });
expertSchema.index({ topics: 1 });

module.exports = mongoose.model('Expert', expertSchema);