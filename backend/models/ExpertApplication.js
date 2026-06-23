const mongoose = require('mongoose');
const { ALL_CATEGORIES } = require('../config/categories');

const expertApplicationSchema = new mongoose.Schema({
    username:    { type: String, required: true },
    category:    { type: String, required: true, enum: ALL_CATEGORIES },
    credentials: { type: String, required: true },
    status:      { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reason:      { type: String, default: null },
    reviewedBy:  { type: String, default: null },
    reviewedAt:  { type: Date, default: null },
    submittedAt: { type: Date, default: Date.now },
});

expertApplicationSchema.index({ username: 1, status: 1 });
expertApplicationSchema.index({ status: 1, submittedAt: -1 });

module.exports = mongoose.model('ExpertApplication', expertApplicationSchema);
