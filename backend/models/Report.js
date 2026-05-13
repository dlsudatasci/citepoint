const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    videoId:        { type: String, required: true, index: true },
    itemId:         { type: String, required: true },
    itemType:       { type: String, required: true, enum: ['citation', 'request'] },
    reason:         { type: String, required: true },
    additionalInfo: { type: String, default: '' },
    timestamp:      { type: Date, default: Date.now },
    status:         { type: String, default: 'pending' },
});

module.exports = mongoose.model('Report', reportSchema);
