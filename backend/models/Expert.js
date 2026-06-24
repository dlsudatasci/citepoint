const mongoose = require('mongoose');
const { ALL_CATEGORIES } = require('../config/categories');

const expertSchema = new mongoose.Schema({
    username:   { type: String, required: true, unique: true },
    categories: [{ type: String, enum: ALL_CATEGORIES }],
    grantedAt:  { type: Date, default: Date.now },
    grantedBy:  { type: String, default: null },
});

expertSchema.index({ username: 1 });
expertSchema.index({ categories: 1 });

module.exports = mongoose.model('Expert', expertSchema);
