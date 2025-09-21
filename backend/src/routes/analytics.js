const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { auth } = require('../middleware/auth');

router.get('/visitors', auth, analyticsController.getVisitors);
router.get('/orders', auth, analyticsController.getOrderTracking);
router.get('/customer-locations', auth, analyticsController.getCustomerLocations);
router.get('/sales-channels', auth, analyticsController.getSalesChannels);
router.get('/top-products', auth, analyticsController.getTopProducts);

module.exports = router;