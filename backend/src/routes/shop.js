const express = require('express');
const { body } = require('express-validator');
const { auth, checkRole } = require('../middleware/auth');
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
router.post('/', validateCreateShop, controller.createShop);
router.get('/me', controller.getMine);
router.put('/me', checkRole(['admin', 'manager']), controller.updateMine);

module.exports = router;
