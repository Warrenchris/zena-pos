const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const validateDateRange = require('../middleware/validateDateRange');

router.use(
  auth,
  authzContext,
  authorize({
    permission: 'view_reports',
    shopScope: 'current'
  })
);

router.get('/visitors', validateDateRange, analyticsController.getVisitors);
router.get('/orders', validateDateRange, analyticsController.getOrderTracking);
router.get('/customer-locations', validateDateRange, analyticsController.getCustomerLocations);
router.get('/sales-channels', validateDateRange, analyticsController.getSalesChannels);
router.get('/top-products', validateDateRange, analyticsController.getTopProducts);

module.exports = router;