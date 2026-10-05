'use strict';

const express = require('express');
const { body } = require('express-validator');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const controller = require('../controllers/shopController');

const router = express.Router();

router.use(auth);
router.use(authzContext);

const validateCreateShop = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Shop name is required')
    .isLength({ max: 255 })
    .withMessage('Shop name must be less than 255 characters'),
  body('address')
    .optional({ nullable: true })
    .trim(),
  body('phone')
    .optional({ nullable: true })
    .trim(),
  body('kraPin')
    .optional({ nullable: true })
    .trim(),
  body('registrationNumber')
    .optional({ nullable: true })
    .trim()
];

router.get('/accessible', controller.getAccessibleShops);
router.post('/', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), validateCreateShop, controller.createShop);
router.get('/me', controller.getMine);
router.put('/me', authorize({ roles: ['admin', 'manager', 'org_admin'], shopScope: 'current' }), controller.updateMine);

// Reversible branch lifecycle (P2-04)
router.patch('/:id/deactivate', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), controller.deactivateShop);
router.patch('/:id/activate', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), controller.activateShop);

// Branch access delegation (Gate 3C)
router.get('/:id/access',
  authorize({
    roles: ['admin', 'org_admin', 'manager'],
    permission: 'manage_employees',
    shopScope: { param: 'id' },
    antiOracle: true
  }),
  controller.getShopAccess
);

router.post('/:id/access',
  requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }),
  authorize({
    roles: ['admin', 'org_admin'],
    shopScope: { param: 'id' },
    antiOracle: true
  }),
  controller.grantShopAccess
);

router.delete('/:id/access/:membershipId',
  requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }),
  authorize({
    roles: ['admin', 'org_admin'],
    shopScope: { param: 'id' },
    antiOracle: true
  }),
  controller.revokeShopAccess
);

module.exports = router;
