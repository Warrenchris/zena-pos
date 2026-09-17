const express = require('express');
const { body } = require('express-validator');
const { auth, checkRole } = require('../middleware/auth');
const transferController = require('../controllers/transferController');

const router = express.Router();

router.use(auth);

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

router.post('/', checkRole(['admin', 'manager']), validateTransfer, transferController.createTransfer);
router.get('/', checkRole(['admin', 'manager', 'cashier']), transferController.getTransfers);

module.exports = router;
