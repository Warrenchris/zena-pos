const express = require('express');
const { auth, checkRole } = require('../middleware/auth');
const controller = require('../controllers/reportsController');
const validateDateRange = require('../middleware/validateDateRange');

const router = express.Router();

router.use(auth, checkRole(['admin', 'manager']));

router.get('/sales-summary', validateDateRange, controller.getSalesSummary);
router.get('/profit-loss', validateDateRange, controller.getProfitAndLoss);
router.get('/tax-estimate', validateDateRange, controller.getTaxEstimate);
router.get('/employee-sales', validateDateRange, controller.getEmployeeSales);

module.exports = router;


