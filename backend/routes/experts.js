const router = require('express').Router();
const { isExpert } = require('../config/experts');

// GET /api/experts/:username
router.get('/:username', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, isExpert: isExpert(req.params.username) });
});

module.exports = router;
