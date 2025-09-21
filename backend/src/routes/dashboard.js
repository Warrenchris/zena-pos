const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

// Protect all dashboard routes
router.use(auth);

// Get dashboard statistics
router.get('/stats', dashboardController.getStats);

// Get revenue data
router.get('/revenue', dashboardController.getRevenueData);

// Get top products
router.get('/top-products', dashboardController.getTopProducts);

module.exports = router;