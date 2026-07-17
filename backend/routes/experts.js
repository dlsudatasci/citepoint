const router            = require('express').Router();
const Expert            = require('../models/Expert');
const ExpertApplication = require('../models/ExpertApplication');
const { isExpert: isHardcodedExpert } = require('../config/experts');
const { isAdmin } = require('../config/admins');
const { TOPICS } = require('../config/constants');
const asyncHandler = require('../middleware/asyncHandler');

// Case-insensitive, '@'-prefix-tolerant username match — same convention used
// for ownership checks elsewhere in the backend.
function usernameMatches(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}

// GET /api/experts/:username — check if user is an expert
router.get('/:username', asyncHandler(async (req, res) => {
    if (isHardcodedExpert(req.params.username)) {
        return res.json({ success: true, isExpert: true, topics: TOPICS });
    }
    const expert = await Expert.findOne({ username: req.params.username }).lean();
    res.set('Cache-Control', 'no-store');
    res.json({
        success: true,
        isExpert: !!expert,
        topics: expert ? expert.topics : [],
    });
}));

// POST /api/experts/apply — submit expert application
router.post('/apply', asyncHandler(async (req, res) => {
    const { username, topics, credentials } = req.body;
    if (!username || !topics || !Array.isArray(topics) || topics.length === 0 || !credentials) {
        return res.status(400).json({ success: false, error: 'username, topics (non-empty array), and credentials are required' });
    }
    if (!topics.every(t => TOPICS.includes(t))) {
        return res.status(400).json({ success: false, error: 'Invalid topic' });
    }

    const existing = await ExpertApplication.findOne({
        username, status: 'pending',
    });
    if (existing) {
        return res.status(409).json({ success: false, error: 'You already have a pending application' });
    }

    const app = await ExpertApplication.create({ username, topics, credentials });
    res.status(201).json({ success: true, id: app._id });
}));

// GET /api/experts/applications/pending?adminUsername=... — admin: list pending applications
router.get('/applications/pending', asyncHandler(async (req, res) => {
    if (!isAdmin(req.query.adminUsername)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const apps = await ExpertApplication.find({ status: 'pending' })
        .sort({ submittedAt: -1 })
        .lean();
    res.json({ success: true, applications: apps });
}));

// GET /api/experts/applications/:username?requesterUsername=... — user's own applications
router.get('/applications/:username', asyncHandler(async (req, res) => {
    if (!usernameMatches(req.params.username, req.query.requesterUsername)) {
        return res.status(403).json({ success: false, error: 'You can only view your own applications' });
    }
    const apps = await ExpertApplication.find({ username: req.params.username })
        .sort({ submittedAt: -1 })
        .lean();
    res.json({ success: true, applications: apps });
}));

// PATCH /api/experts/applications/:id/review — admin: approve or reject
router.patch('/applications/:id/review', asyncHandler(async (req, res) => {
    const { status, reviewedBy, reason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, error: 'status must be approved or rejected' });
    }
    if (!reviewedBy) {
        return res.status(400).json({ success: false, error: 'reviewedBy is required' });
    }
    if (!isAdmin(reviewedBy)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const app = await ExpertApplication.findByIdAndUpdate(req.params.id, {
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reason: reason || null,
    }, { new: true });

    if (!app) {
        return res.status(404).json({ success: false, error: 'Application not found' });
    }

    if (status === 'approved') {
        await Expert.findOneAndUpdate(
            { username: app.username },
            { $addToSet: { topics: { $each: app.topics } }, $setOnInsert: { grantedAt: new Date(), grantedBy: reviewedBy } },
            { upsert: true }
        );
    }

    res.json({ success: true, application: app });
}));

module.exports = router;
