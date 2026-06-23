const router            = require('express').Router();
const Expert            = require('../models/Expert');
const ExpertApplication = require('../models/ExpertApplication');
const { isExpert: isHardcodedExpert } = require('../config/experts');
const { ALL_CATEGORIES } = require('../config/categories');

// GET /api/experts/:username — check if user is an expert
router.get('/:username', async (req, res) => {
    try {
        if (isHardcodedExpert(req.params.username)) {
            return res.json({ success: true, isExpert: true, categories: ALL_CATEGORIES });
        }
        const expert = await Expert.findOne({ username: req.params.username }).lean();
        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            isExpert: !!expert,
            categories: expert ? expert.categories : [],
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/experts/apply — submit expert application
router.post('/apply', async (req, res) => {
    try {
        const { username, category, credentials } = req.body;
        if (!username || !category || !credentials) {
            return res.status(400).json({ success: false, error: 'username, category, and credentials are required' });
        }
        if (!ALL_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Invalid category' });
        }

        const existing = await ExpertApplication.findOne({
            username, category, status: 'pending',
        });
        if (existing) {
            return res.status(409).json({ success: false, error: 'You already have a pending application for this category' });
        }

        const app = await ExpertApplication.create({ username, category, credentials });
        res.status(201).json({ success: true, id: app._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/experts/applications/pending — admin: list pending applications
router.get('/applications/pending', async (req, res) => {
    try {
        const apps = await ExpertApplication.find({ status: 'pending' })
            .sort({ submittedAt: -1 })
            .lean();
        res.json({ success: true, applications: apps });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/experts/applications/:username — user's own applications
router.get('/applications/:username', async (req, res) => {
    try {
        const apps = await ExpertApplication.find({ username: req.params.username })
            .sort({ submittedAt: -1 })
            .lean();
        res.json({ success: true, applications: apps });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/experts/applications/:id/review — admin: approve or reject
router.patch('/applications/:id/review', async (req, res) => {
    try {
        const { status, reviewedBy, reason } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, error: 'status must be approved or rejected' });
        }
        if (!reviewedBy) {
            return res.status(400).json({ success: false, error: 'reviewedBy is required' });
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
                { $addToSet: { categories: app.category }, $setOnInsert: { grantedAt: new Date(), grantedBy: reviewedBy } },
                { upsert: true }
            );
        }

        res.json({ success: true, application: app });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
