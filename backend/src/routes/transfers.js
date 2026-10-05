const express = require('express');
const { body } = require('express-validator');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const transferController = require('../controllers/transferController');

const router = express.Router();

router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

const validateTransfer = [
  body('sourceShopId')
    .notEmpty()
    .withMessage('Source shop is required')
    .isInt({ min: 1 })
    .withMessage('Source shop must be a valid integer ID'),
  body('destinationShopId')
    .notEmpty()
    .withMessage('Destination shop is required')
    .isInt({ min: 1 })
    .withMessage('Destination shop must be a valid integer ID'),
  body('productId')
    .notEmpty()
    .withMessage('Product is required')
    .isInt({ min: 1 })
    .withMessage('Product must be a valid integer ID'),
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isFloat({ gt: 0 })
    .withMessage('Quantity must be greater than 0'),
  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
];

router.post('/',
  authorize({
    permission: 'manage_products',
    custom: async (req, authz) => {
      const srcId = parseInt(req.body?.sourceShopId, 10);
      const dstId = parseInt(req.body?.destinationShopId, 10);
      if (srcId && !authz.scope.hasShopAccess(srcId)) {
        return {
          allowed: false,
          status: 403,
          code: 'SOURCE_SHOP_ACCESS_DENIED',
          message: 'Source shop not found or does not belong to your organization.'
        };
      }
      if (dstId && !authz.scope.hasShopAccess(dstId)) {
        return {
          allowed: false,
          status: 403,
          code: 'DESTINATION_SHOP_ACCESS_DENIED',
          message: 'Destination shop not found or does not belong to your organization.'
        };
      }
      return { allowed: true };
    }
  }),
  validateTransfer,
  transferController.createTransfer
);

router.get('/',
  authorize({
    permissions: { any: ['view_products', 'manage_products'] },
    shopScope: 'current'
  }),
  transferController.getTransfers
);

module.exports = router;
