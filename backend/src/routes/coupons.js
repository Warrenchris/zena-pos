const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', couponController.getCoupons);
router.post('/validate', couponController.validateCoupon);
router.get('/:id', couponController.getCouponById);
router.post('/', couponController.createCoupon);
router.put('/:id', couponController.updateCoupon);
router.delete('/:id', couponController.deleteCoupon);

module.exports = router;
