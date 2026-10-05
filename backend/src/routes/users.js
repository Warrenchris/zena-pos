'use strict';

const express = require('express');
const { body } = require('express-validator');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const controller = require('../controllers/userController');

const router = express.Router();

// All staff/user administration routes require authentication and canonical authorization context
router.use(auth);
router.use(authzContext);

router.get('/',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_employees',
    shopScope: 'current'
  }),
  controller.list
);

router.post(
  '/',
  requireVerifiedEmail,
  [
    body('name').trim().notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(['admin', 'cashier', 'manager'])
  ],
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_employees',
    shopScope: 'current'
  }),
  controller.create
);

router.put('/:id/role',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_employees',
    shopScope: 'current'
  }),
  controller.updateRole
);

module.exports = router;
