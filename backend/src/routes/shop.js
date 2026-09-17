'use strict';

const express = require('express');
const { body } = require('express-validator');
const { auth, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const controller = require('../controllers/shopController');

const router = express.Router();

router.use(auth);

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
router.put('/me', checkRole(['admin', 'manager']), controller.updateMine);

// Reversible branch lifecycle (P2-04)
router.patch('/:id/deactivate', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), controller.deactivateShop);
router.patch('/:id/activate', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), controller.activateShop);

// Owner-controlled branch delegation (P1-03)
router.get('/:id/access', controller.getShopAccess);
router.post('/:id/access', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), controller.grantShopAccess);
router.delete('/:id/access/:membershipId', requireActiveSubscription({ suspendedCode: 'SUBSCRIPTION_SUSPENDED' }), controller.revokeShopAccess);

module.exports = router;
