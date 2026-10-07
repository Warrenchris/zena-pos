const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const insightsController = require('../controllers/insightsController');
const orgInsightsRoutes = require('./orgInsightsRoutes');

// Mount organization-level insights sub-router before shop-scoped routes
router.use('/organization', orgInsightsRoutes);

// Protect shop-scoped insights routes with canonical authorization pipeline
router.use(
  auth,
  authzContext,
  authorize({
    permission: 'view_reports',
    shopScope: 'current'
  })
);

router.get('/', insightsController.getInsights);
router.get('/customer-segments', insightsController.getCustomerSegments);
router.get('/monthly-revenue', insightsController.getMonthlyRevenue);
router.get('/daily-sales', insightsController.getDailySales);
router.get('/stock-depletion', insightsController.getStockDepletion);

module.exports = router;

