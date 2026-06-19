const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const insightsController = require('../controllers/insightsController');

router.get('/', auth, insightsController.getInsights);
router.get('/customer-segments', auth, insightsController.getCustomerSegments);
router.get('/monthly-revenue', auth, insightsController.getMonthlyRevenue);
router.get('/daily-sales', auth, insightsController.getDailySales);
router.get('/stock-depletion', auth, insightsController.getStockDepletion);

module.exports = router;
