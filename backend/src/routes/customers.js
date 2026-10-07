const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const { validateDateRange } = require('../middleware/validators');
const { Customer } = require('../models');

// Validation middleware
const validateCustomer = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be less than 100 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/)
    .withMessage('Invalid phone number format'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must be less than 200 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
];

const validateLoyaltyPoints = [
  body('points')
    .isInt()
    .withMessage('Points must be an integer'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 200 })
    .withMessage('Reason must be less than 200 characters')
];

// All routes require authentication, canonical authorization context, and active subscription
router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

// Ownership policies for customer lookups and mutations
const customerViewOwnershipPolicy = {
  getResource: (req) => Customer.findOne({
    where: { id: req.params.id, active: true },
    attributes: ['id', 'organizationId']
  }),
  isOwner: () => true, // Allowed for all authorized tenant staff (cashiers, managers, admins)
  antiOracle: true
};

const customerMutationOwnershipPolicy = {
  getResource: (req) => Customer.findOne({
    where: { id: req.params.id, active: true },
    attributes: ['id', 'organizationId']
  }),
  managerPermission: 'manage_customers',
  antiOracle: true
};

// Routes
router.get('/', 
  authorize({
    permissions: { any: ['view_customers', 'manage_customers', 'access_pos'] },
    shopScope: 'current'
  }),
  customerController.getAllCustomers
);

router.get('/statistics', 
  authorize({
    permissions: { any: ['view_reports', 'manage_customers'] },
    roles: ['admin', 'manager', 'org_admin'],
    shopScope: 'current'
  }),
  validateDateRange,
  customerController.getCustomerStatistics
);

router.get('/:id', 
  authorize({
    permissions: { any: ['view_customers', 'manage_customers', 'access_pos'] },
    shopScope: 'current',
    ownership: customerViewOwnershipPolicy
  }),
  customerController.getCustomerById
);

router.post('/', 
  authorize({
    permissions: { any: ['manage_customers', 'access_pos'] },
    shopScope: 'current'
  }),
  validateCustomer,
  customerController.createCustomer
);

router.put('/:id', 
  authorize({
    permission: 'manage_customers',
    shopScope: 'current',
    ownership: customerMutationOwnershipPolicy
  }),
  validateCustomer,
  customerController.updateCustomer
);

router.delete('/:id', 
  authorize({
    roles: ['admin', 'org_admin'],
    shopScope: 'current',
    ownership: customerMutationOwnershipPolicy
  }),
  customerController.deleteCustomer
);

router.patch('/:id/loyalty-points', 
  authorize({
    permission: 'manage_customers',
    shopScope: 'current',
    ownership: customerMutationOwnershipPolicy
  }),
  validateLoyaltyPoints,
  customerController.adjustLoyaltyPoints
);

module.exports = router;

