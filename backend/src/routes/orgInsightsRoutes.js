const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const requireOrgAdmin = require('../middleware/requireOrgAdmin');
const orgInsightsController = require('../controllers/orgInsightsController');

router.use(
  auth,
  authzContext,
  authorize({
    requireOrgAdmin: true
  }),
  requireOrgAdmin
);

router.get('/summary', orgInsightsController.getOrganizationSummary);
router.get('/inventory-alerts', orgInsightsController.getOrganizationInventoryAlerts);
router.get('/daily-sales', orgInsightsController.getOrganizationDailySales);

module.exports = router;
