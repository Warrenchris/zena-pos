const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

// All routes are protected and require authentication
router.use(auth);

// Get overall statistics
router.get('/stats', dashboardController.getStats);

// Get revenue data
router.get('/revenue', dashboardController.getRevenueData);

// Get top selling products
router.get('/top-products', dashboardController.getTopProducts);

// Get visitor statistics
router.get('/visitors', dashboardController.getVisitorStats);

// Get order tracking data
router.get('/orders', dashboardController.getOrderStats);

// Get platform distribution data
router.get('/platform', dashboardController.getPlatformStats);

// Get location-based audience data
router.get('/locations', dashboardController.getLocationStats);

module.exports = router;