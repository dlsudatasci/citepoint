const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
    username:       { type: String, required: true, unique: true },
    displayName:    { type: String, default: '' },
    bio:            { type: String, default: '', maxlength: 500 },
    followedTopics: [{ type: String }],
    mutedTopics:    [{ type: String }],
    createdAt:      { type: Date, default: Date.now },
});

// username's index is already created by `unique: true` above.

module.exports = mongoose.model('UserProfile', userProfileSchema);
