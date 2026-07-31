const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discountController');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', discountController.getDiscounts);
router.get('/:id', discountController.getDiscountById);
router.post('/', discountController.createDiscount);
router.put('/:id', discountController.updateDiscount);
router.delete('/:id', discountController.deleteDiscount);

module.exports = router;
