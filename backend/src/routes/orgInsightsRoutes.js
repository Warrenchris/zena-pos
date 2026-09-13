const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const requireOrgAdmin = require('../middleware/requireOrgAdmin');
const orgInsightsController = require('../controllers/orgInsightsController');

router.get('/summary', auth, requireOrgAdmin, orgInsightsController.getOrganizationSummary);
router.get('/inventory-alerts', auth, requireOrgAdmin, orgInsightsController.getOrganizationInventoryAlerts);
router.get('/daily-sales', auth, requireOrgAdmin, orgInsightsController.getOrganizationDailySales);

module.exports = router;
