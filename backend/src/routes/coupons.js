const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const { Coupon, Shop } = require('../models');

router.use(auth);
router.use(authzContext);

const couponOwnershipPolicy = {
  getResource: (req) => Coupon.findOne({
    where: { id: req.params.id },
    include: [{ model: Shop, attributes: ['organizationId'] }]
  }),
  managerPermission: 'manage_coupons',
  antiOracle: true
};

router.get('/', authorize({ permission: 'manage_coupons', shopScope: 'current' }), couponController.getCoupons);
router.post('/validate', authorize({
  permissions: { any: ['create_sales', 'access_pos', 'manage_coupons'] },
  shopScope: 'current'
}), couponController.validateCoupon);
router.get('/:id', authorize({
  permission: 'manage_coupons',
  shopScope: 'current',
  ownership: couponOwnershipPolicy
}), couponController.getCouponById);
router.post('/', authorize({ permission: 'manage_coupons', shopScope: 'current' }), couponController.createCoupon);
router.put('/:id', authorize({
  permission: 'manage_coupons',
  shopScope: 'current',
  ownership: couponOwnershipPolicy
}), couponController.updateCoupon);
router.delete('/:id', authorize({
  permission: 'manage_coupons',
  shopScope: 'current',
  ownership: couponOwnershipPolicy
}), couponController.deleteCoupon);

module.exports = router;
