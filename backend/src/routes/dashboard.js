const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');
const validateDateRange = require('../middleware/validateDateRange');

// Protect all dashboard routes
router.use(auth);

// Get dashboard statistics
router.get('/stats', validateDateRange, dashboardController.getStats);

// Get revenue data
router.get('/revenue', validateDateRange, dashboardController.getRevenueData);

// Get top products
router.get('/top-products', validateDateRange, dashboardController.getTopProducts);

module.exports = router;