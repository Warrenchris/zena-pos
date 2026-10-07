const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discountController');
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const { DiscountRule, Shop } = require('../models');

router.use(auth);
router.use(authzContext);

const discountOwnershipPolicy = {
  getResource: (req) => DiscountRule.findOne({
    where: { id: req.params.id },
    include: [{ model: Shop, attributes: ['organizationId'] }]
  }),
  managerPermission: 'manage_discounts',
  antiOracle: true
};

router.get('/', authorize({ permission: 'manage_discounts', shopScope: 'current' }), discountController.getDiscounts);
router.get('/:id', authorize({
  permission: 'manage_discounts',
  shopScope: 'current',
  ownership: discountOwnershipPolicy
}), discountController.getDiscountById);
router.post('/', authorize({ permission: 'manage_discounts', shopScope: 'current' }), discountController.createDiscount);
router.put('/:id', authorize({
  permission: 'manage_discounts',
  shopScope: 'current',
  ownership: discountOwnershipPolicy
}), discountController.updateDiscount);
router.delete('/:id', authorize({
  permission: 'manage_discounts',
  shopScope: 'current',
  ownership: discountOwnershipPolicy
}), discountController.deleteDiscount);

module.exports = router;
