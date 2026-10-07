const { DiscountRule } = require('../models');
const { Op } = require('sequelize');

// Helper for shop filtering using canonical authorization context
const getAuthorizedShopId = (req) => {
  return req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
};
const shopWhere = (req) => ({ shopId: getAuthorizedShopId(req) });

// Get all discount rules for user's shop
exports.getDiscounts = async (req, res) => {
  try {
    const where = shopWhere(req);
    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.search}%` } },
        { targetName: { [Op.like]: `%${req.query.search}%` } }
      ];
    }
    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive === 'true';
    }

    const rules = await DiscountRule.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.json(rules);
  } catch (error) {
    console.error('Error fetching discount rules:', error);
    res.status(500).json({ error: 'Failed to fetch discount rules', details: error.message });
  }
};

// Get discount rule by ID
exports.getDiscountById = async (req, res) => {
  try {
    const rule = await DiscountRule.findOne({
      where: { id: req.params.id, ...shopWhere(req) }
    });
    if (!rule) return res.status(404).json({ error: 'Discount rule not found' });
    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch discount rule' });
  }
};

// Create new discount rule
exports.createDiscount = async (req, res) => {
  try {
    const {
      name,
      ruleType,
      discountValue,
      scope,
      targetName,
      targetId,
      minQuantity,
      minAmount,
      startDate,
      endDate,
      isActive,
      description
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Discount rule name is required' });
    }

    const numDiscountValue = parseFloat(discountValue) || 0;
    if (numDiscountValue < 0) {
      return res.status(400).json({ error: 'Discount value cannot be negative' });
    }
    if ((ruleType || 'percentage') === 'percentage' && numDiscountValue > 100) {
      return res.status(400).json({ error: 'Discount percentage cannot exceed 100%' });
    }
    if (minAmount !== undefined && parseFloat(minAmount) < 0) {
      return res.status(400).json({ error: 'Minimum amount cannot be negative' });
    }
    if (minQuantity !== undefined && parseInt(minQuantity, 10) < 0) {
      return res.status(400).json({ error: 'Minimum quantity cannot be negative' });
    }

    const rule = await DiscountRule.create({
      name: String(name).trim(),
      ruleType: ruleType || 'percentage',
      discountValue: numDiscountValue,
      scope: scope || 'storewide',
      targetName: targetName ? String(targetName).trim() : 'All Products',
      targetId: targetId ? parseInt(targetId, 10) : null,
      minQuantity: minQuantity !== undefined ? parseInt(minQuantity, 10) : 1,
      minAmount: minAmount !== undefined ? parseFloat(minAmount) : 0,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive: isActive !== undefined ? isActive : true,
      description: description ? String(description).trim() : null,
      shopId: getAuthorizedShopId(req)
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating discount rule:', error);
    res.status(500).json({ error: 'Failed to create discount rule', details: error.message });
  }
};

// Update discount rule
exports.updateDiscount = async (req, res) => {
  try {
    const rule = await DiscountRule.findOne({
      where: { id: req.params.id, ...shopWhere(req) }
    });
    if (!rule) return res.status(404).json({ error: 'Discount rule not found' });

    const {
      name,
      ruleType,
      discountValue,
      scope,
      targetName,
      targetId,
      minQuantity,
      minAmount,
      startDate,
      endDate,
      isActive,
      description
    } = req.body;

    if (name !== undefined) rule.name = String(name).trim();
    if (ruleType !== undefined) rule.ruleType = ruleType;
    if (discountValue !== undefined) {
      const numVal = parseFloat(discountValue);
      if (isNaN(numVal) || numVal < 0) {
        return res.status(400).json({ error: 'Discount value cannot be negative' });
      }
      const targetType = ruleType !== undefined ? ruleType : rule.ruleType;
      if (targetType === 'percentage' && numVal > 100) {
        return res.status(400).json({ error: 'Discount percentage cannot exceed 100%' });
      }
      rule.discountValue = numVal;
    }
    if (minAmount !== undefined) {
      const numMinAmount = parseFloat(minAmount);
      if (isNaN(numMinAmount) || numMinAmount < 0) {
        return res.status(400).json({ error: 'Minimum amount cannot be negative' });
      }
      rule.minAmount = numMinAmount;
    }
    if (minQuantity !== undefined) {
      const numMinQty = parseInt(minQuantity, 10);
      if (isNaN(numMinQty) || numMinQty < 0) {
        return res.status(400).json({ error: 'Minimum quantity cannot be negative' });
      }
      rule.minQuantity = numMinQty;
    }
    if (scope !== undefined) rule.scope = scope;
    if (targetName !== undefined) rule.targetName = String(targetName).trim();
    if (targetId !== undefined) rule.targetId = targetId ? parseInt(targetId, 10) : null;
    if (startDate !== undefined) rule.startDate = startDate || null;
    if (endDate !== undefined) rule.endDate = endDate || null;
    if (isActive !== undefined) rule.isActive = isActive;
    if (description !== undefined) rule.description = description ? String(description).trim() : null;

    await rule.save();
    res.json(rule);
  } catch (error) {
    console.error('Error updating discount rule:', error);
    res.status(500).json({ error: 'Failed to update discount rule', details: error.message });
  }
};

// Delete discount rule
exports.deleteDiscount = async (req, res) => {
  try {
    const rule = await DiscountRule.findOne({
      where: { id: req.params.id, ...shopWhere(req) }
    });
    if (!rule) return res.status(404).json({ error: 'Discount rule not found' });

    await rule.destroy();
    res.json({ message: 'Discount rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting discount rule:', error);
    res.status(500).json({ error: 'Failed to delete discount rule' });
  }
};
