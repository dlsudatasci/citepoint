const mongoose = require('mongoose');

const citationSchema = new mongoose.Schema({
    videoId:        { type: String, required: true, index: true },
    citationTitle:  { type: String, required: true },
    timestampStart: { type: String, default: '' },
    timestampEnd:   { type: String, default: '' },
    description:    { type: String, default: '' },
    source:         { type: String, default: '' },
    username:       { type: String, required: true },
    dateAdded:      { type: Date, default: Date.now },
    voteScore:      { type: Number, default: 0 },
    requestId:      { type: String, default: null },
});

citationSchema.index({ videoId: 1, dateAdded: -1 });
citationSchema.index({ videoId: 1, voteScore: -1 });

module.exports = mongoose.model('Citation', citationSchema);
