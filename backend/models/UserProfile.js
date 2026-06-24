const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
    username:       { type: String, required: true, unique: true },
    displayName:    { type: String, default: '' },
    bio:            { type: String, default: '', maxlength: 500 },
    followedCategories: [{ type: String }],
    mutedCategories:    [{ type: String }],
    createdAt:      { type: Date, default: Date.now },
});

userProfileSchema.index({ username: 1 });

module.exports = mongoose.model('UserProfile', userProfileSchema);
