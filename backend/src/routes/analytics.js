const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { auth } = require('../middleware/auth');
const validateDateRange = require('../middleware/validateDateRange');

router.get('/visitors', auth, validateDateRange, analyticsController.getVisitors);
router.get('/orders', auth, validateDateRange, analyticsController.getOrderTracking);
router.get('/customer-locations', auth, validateDateRange, analyticsController.getCustomerLocations);
router.get('/sales-channels', auth, validateDateRange, analyticsController.getSalesChannels);
router.get('/top-products', auth, validateDateRange, analyticsController.getTopProducts);

module.exports = router;