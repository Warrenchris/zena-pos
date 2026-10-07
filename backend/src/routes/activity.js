const express = require('express');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const controller = require('../controllers/activityController');

const router = express.Router();

router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

router.get('/',
  authorize({
    permissions: { any: ['manage_settings', 'view_reports'] },
    roles: ['admin', 'manager', 'org_admin'],
    shopScope: 'current'
  }),
  controller.list
);

module.exports = router;



