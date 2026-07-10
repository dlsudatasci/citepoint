const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    type:      { type: String, enum: ['new_citation', 'new_request', 'application_approved', 'application_rejected'], required: true },
    category:  { type: String, default: null },
    topic:     { type: String, default: null },
    videoId:   { type: String, default: null },
    itemId:    { type: String, default: null },
    itemType:  { type: String, enum: ['citation', 'request', null], default: null },
    title:     { type: String, default: '' },
    read:      { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ username: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
