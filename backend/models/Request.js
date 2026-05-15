const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    videoId:        { type: String, required: true, index: true },
    title:          { type: String, required: true },
    timestampStart: { type: String, default: '' },
    timestampEnd:   { type: String, default: '' },
    reason:         { type: String, default: '' },
    username:       { type: String, required: true },
    dateAdded:      { type: Date, default: Date.now },
    voteScore:      { type: Number, default: 0 },
});

module.exports = mongoose.model('Request', requestSchema);
