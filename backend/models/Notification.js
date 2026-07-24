const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    type:      { type: String, enum: ['new_citation', 'new_request', 'application_approved', 'application_rejected', 'reply', 'mention'], required: true },
    category:  { type: String, default: null },
    topic:     { type: String, default: null },
    videoId:   { type: String, default: null },
    itemId:    { type: String, default: null },
    itemType:  { type: String, enum: ['citation', 'request', null], default: null },
    title:     { type: String, default: '' },
    read:      { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },

    // Who triggered the notification (e.g. the replier) — 'new_citation'/'new_request'
    // are broadcast-style and have no single actor, so this stays null for those.
    fromUsername: { type: String, default: null },
    // Top of the thread this notification belongs to, so "Open Discussion" can deep-link
    // straight to the thread without re-walking parentCitationId.
    rootItemId:   { type: String, default: null },
    rootItemType: { type: String, enum: ['citation', 'request', null], default: null },
});

notificationSchema.index({ username: 1, read: 1, createdAt: -1 });
// My Discussions aggregation: "threads where someone replied to me" / unread-per-thread.
notificationSchema.index({ username: 1, rootItemId: 1, rootItemType: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
