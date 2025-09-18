const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const insightsController = require('../controllers/insightsController');

// Get business insights
router.get('/', auth, insightsController.getInsights);

module.exports = router;