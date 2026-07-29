const router            = require('express').Router();
const Expert            = require('../models/Expert');
const ExpertApplication = require('../models/ExpertApplication');
const Notification      = require('../models/Notification');
const Citation          = require('../models/Citation');
const Request           = require('../models/Request');
const { isExpert: isHardcodedExpert } = require('../config/experts');
const { isAdmin, ADMIN_USERNAMES_CANONICAL } = require('../config/admins');
const { TOPICS } = require('../config/constants');
const asyncHandler = require('../middleware/asyncHandler');
const { usernameMatches } = require('../lib/usernameMatches');

// GET /api/experts/admin/list?adminUsername=... — admin: list all verified experts
router.get('/admin/list', asyncHandler(async (req, res) => {
    if (!isAdmin(req.query.adminUsername)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const experts = await Expert.find().sort({ grantedAt: -1 }).lean();
    res.json({ success: true, experts });
}));

// DELETE /api/experts/admin/:username — admin: revoke expert status
router.delete('/admin/:username', asyncHandler(async (req, res) => {
    const { adminUsername } = req.body;
    if (!isAdmin(adminUsername)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const result = await Expert.findOneAndDelete({ username: req.params.username });
    if (!result) {
        return res.status(404).json({ success: false, error: 'Expert not found' });
    }

    // Strip expert verification from all their existing content
    const unverify = { categoryVerified: false, verifiedBy: null, verifiedAt: null };
    await Promise.all([
        Citation.updateMany({ username: req.params.username, categoryVerified: true }, unverify),
        Request.updateMany({ username: req.params.username, categoryVerified: true }, unverify),
    ]);

    res.json({ success: true });
}));

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

    // Notify all admins of the new application
    if (ADMIN_USERNAMES_CANONICAL.length > 0) {
        await Notification.insertMany(
            ADMIN_USERNAMES_CANONICAL.map(adminUsername => ({
                username: adminUsername,
                type: 'expert_application',
                title: `${username} submitted an expert application for: ${topics.join(', ')}.`,
                fromUsername: username,
            }))
        );
    }

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

    await Notification.create({
        username: app.username,
        type:     status === 'approved' ? 'application_approved' : 'application_rejected',
        title:    status === 'approved'
            ? `Your expert application for ${app.topics.join(', ')} was approved!`
            : `Your expert application for ${app.topics.join(', ')} was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    });

    res.json({ success: true, application: app });
}));

module.exports = router;
