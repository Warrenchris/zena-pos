const { Coupon } = require('../models');
const { Op } = require('sequelize');

// Helper for shop filtering
const shopWhere = (req) => ({ shopId: req.user.shopId });

// Get all coupons for user's shop
exports.getCoupons = async (req, res) => {
  try {
    const where = shopWhere(req);
    if (req.query.search) {
      where[Op.or] = [
        { code: { [Op.like]: `%${req.query.search}%` } },
        { title: { [Op.like]: `%${req.query.search}%` } }
      ];
    }
    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive === 'true';
    }

    let coupons = await Coupon.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    // Auto-seed default coupons into DB table if empty
    if (coupons.length === 0 && !req.query.search) {
      try {
        const defaultSeed = [
          {
            code: 'WELCOME10',
            title: 'Welcome New Customer',
            discountType: 'percentage',
            discountValue: 10,
            minSpend: 500,
            maxDiscount: 200,
            usageLimit: 100,
            usedCount: 24,
            perUserLimit: 1,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            isActive: true,
            description: '10% discount for first-time shoppers on orders over KSh 500.',
            shopId: req.user.shopId
          },
          {
            code: 'EASTER500',
            title: 'Easter Shopping Voucher',
            discountType: 'fixed',
            discountValue: 500,
            minSpend: 2500,
            usageLimit: 50,
            usedCount: 50,
            perUserLimit: 1,
            startDate: '2026-04-01',
            endDate: '2026-04-30',
            isActive: true,
            description: 'Flat KSh 500 discount on Easter festival cart totals over KSh 2,500.',
            shopId: req.user.shopId
          },
          {
            code: 'FLASH20',
            title: 'Flash Sale Promo',
            discountType: 'percentage',
            discountValue: 20,
            minSpend: 1000,
            maxDiscount: 1000,
            usageLimit: 200,
            usedCount: 18,
            perUserLimit: 2,
            startDate: '2026-07-01',
            endDate: '2026-08-15',
            isActive: true,
            description: '20% off storewide during Mid-Year Flash Sales.',
            shopId: req.user.shopId
          }
        ];
        await Coupon.bulkCreate(defaultSeed, { ignoreDuplicates: true });
        coupons = await Coupon.findAll({ where, order: [['createdAt', 'DESC']] });
      } catch (seedErr) {
        console.warn('Coupon auto-seed skipped:', seedErr.message);
      }
    }

    res.json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ error: 'Failed to fetch coupons', details: error.message });
  }
};

// Get coupon by ID
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({
      where: { id: req.params.id, ...shopWhere(req) }
    });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json(coupon);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coupon' });
  }
};

// Create new coupon
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      discountType,
      discountValue,
      minSpend,
      maxDiscount,
      usageLimit,
      perUserLimit,
      startDate,
      endDate,
      isActive,
      description
    } = req.body;

    if (!code || !title || discountValue === undefined) {
      return res.status(400).json({ error: 'Code, title, and discountValue are required' });
    }

    const cleanCode = String(code).trim().toUpperCase();

    // Check code uniqueness within shop
    const existing = await Coupon.findOne({
      where: { code: cleanCode, ...shopWhere(req) }
    });
    if (existing) {
      return res.status(400).json({ error: `Coupon code "${cleanCode}" already exists` });
    }

    const coupon = await Coupon.create({
      code: cleanCode,
      title: String(title).trim(),
      discountType: discountType || 'percentage',
      discountValue: parseFloat(discountValue) || 0,
      minSpend: parseFloat(minSpend) || 0,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      usageLimit: parseInt(usageLimit, 10) || 100,
      usedCount: 0,
      perUserLimit: parseInt(perUserLimit, 10) || 1,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive: isActive !== undefined ? isActive : true,
      description: description ? String(description).trim() : null,
      shopId: req.user.shopId
    });

    res.status(201).json(coupon);
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon', details: error.message });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({
      where: { id: req.params.id, ...shopWhere(req) }
    });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });

    const {
      code,
      title,
      discountType,
      discountValue,
      minSpend,
      maxDiscount,
      usageLimit,
      perUserLimit,
      startDate,
      endDate,
      isActive,
      description
    } = req.body;

    if (code) {
      const cleanCode = String(code).trim().toUpperCase();
      if (cleanCode !== coupon.code) {
        const existing = await Coupon.findOne({
          where: { code: cleanCode, ...shopWhere(req) }
        });
        if (existing) {
          return res.status(400).json({ error: `Coupon code "${cleanCode}" already exists` });
        }
        coupon.code = cleanCode;
      }
    }

    if (title !== undefined) coupon.title = String(title).trim();
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = parseFloat(discountValue);
    if (minSpend !== undefined) coupon.minSpend = parseFloat(minSpend);
    if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount ? parseFloat(maxDiscount) : null;
    if (usageLimit !== undefined) coupon.usageLimit = parseInt(usageLimit, 10);
    if (perUserLimit !== undefined) coupon.perUserLimit = parseInt(perUserLimit, 10);
    if (startDate !== undefined) coupon.startDate = startDate || null;
    if (endDate !== undefined) coupon.endDate = endDate || null;
    if (isActive !== undefined) coupon.isActive = isActive;
    if (description !== undefined) coupon.description = description ? String(description).trim() : null;

    await coupon.save();
    res.json(coupon);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ error: 'Failed to update coupon', details: error.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({
      where: { id: req.params.id, ...shopWhere(req) }
    });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });

    await coupon.destroy();
    res.json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
};

// Validate coupon for checkout
exports.validateCoupon = async (req, res) => {
  try {
    const { code, cartAmount = 0 } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code required' });

    const cleanCode = String(code).trim().toUpperCase();
    const coupon = await Coupon.findOne({
      where: { code: cleanCode, ...shopWhere(req) }
    });

    if (!coupon) {
      return res.status(400).json({ valid: false, error: 'Invalid coupon code' });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ valid: false, error: 'This coupon is inactive' });
    }

    const now = new Date();
    if (coupon.startDate && new Date(coupon.startDate) > now) {
      return res.status(400).json({ valid: false, error: 'This coupon is not valid yet' });
    }

    if (coupon.endDate && new Date(coupon.endDate + 'T23:59:59') < now) {
      return res.status(400).json({ valid: false, error: 'This coupon has expired' });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ valid: false, error: 'Coupon redemption limit reached' });
    }

    const subtotal = parseFloat(cartAmount) || 0;
    if (coupon.minSpend > 0 && subtotal < parseFloat(coupon.minSpend)) {
      return res.status(400).json({
        valid: false,
        error: `Minimum spend of KSh ${coupon.minSpend} required to use this coupon`
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (subtotal * parseFloat(coupon.discountValue)) / 100;
      if (coupon.maxDiscount && discount > parseFloat(coupon.maxDiscount)) {
        discount = parseFloat(coupon.maxDiscount);
      }
    } else {
      discount = parseFloat(coupon.discountValue);
    }

    discount = Math.min(discount, subtotal);

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: parseFloat(coupon.discountValue),
        computedDiscount: discount
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
};
