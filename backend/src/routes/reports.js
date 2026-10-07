const express = require('express');
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const controller = require('../controllers/reportsController');
const validateDateRange = require('../middleware/validateDateRange');

const router = express.Router();

router.use(
  auth,
  authzContext,
  authorize({
    permission: 'view_reports',
    shopScope: 'current'
  })
);

router.get('/sales-summary', validateDateRange, controller.getSalesSummary);
router.get('/profit-loss', validateDateRange, controller.getProfitAndLoss);
router.get('/tax-estimate', validateDateRange, controller.getTaxEstimate);
router.get('/employee-sales', validateDateRange, controller.getEmployeeSales);

module.exports = router;


