const express = require('express');
const { auth, checkRole } = require('../middleware/auth');
const controller = require('../controllers/reportsController');

const router = express.Router();

router.use(auth, checkRole(['admin', 'manager']));

router.get('/sales-summary', controller.getSalesSummary);
router.get('/profit-loss', controller.getProfitAndLoss);
router.get('/tax-estimate', controller.getTaxEstimate);
router.get('/employee-sales', controller.getEmployeeSales);


module.exports = router;


