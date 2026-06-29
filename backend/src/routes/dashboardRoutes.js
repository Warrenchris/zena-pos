const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');
const validateDateRange = require('../middleware/validateDateRange');

// All routes are protected and require authentication
router.use(auth);

// Get overall statistics
router.get('/stats', validateDateRange, dashboardController.getStats);

// Get revenue data
router.get('/revenue', validateDateRange, dashboardController.getRevenueData);

// Get top selling products
router.get('/top-products', validateDateRange, dashboardController.getTopProducts);

// Get visitor statistics
router.get('/visitors', validateDateRange, dashboardController.getVisitorStats);

// Get order tracking data
router.get('/orders', validateDateRange, dashboardController.getOrderStats);

// Get platform distribution data
router.get('/platform', validateDateRange, dashboardController.getPlatformStats);

// Get location-based audience data
router.get('/locations', validateDateRange, dashboardController.getLocationStats);

module.exports = router;