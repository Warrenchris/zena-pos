const { DiscountRule } = require('../models');
const { Op } = require('sequelize');

// Helper for shop filtering
const shopWhere = (req) => ({ shopId: req.user.shopId });

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

    const rule = await DiscountRule.create({
      name: String(name).trim(),
      ruleType: ruleType || 'percentage',
      discountValue: parseFloat(discountValue) || 0,
      scope: scope || 'storewide',
      targetName: targetName ? String(targetName).trim() : 'All Products',
      targetId: targetId ? parseInt(targetId, 10) : null,
      minQuantity: parseInt(minQuantity, 10) || 1,
      minAmount: parseFloat(minAmount) || 0,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive: isActive !== undefined ? isActive : true,
      description: description ? String(description).trim() : null,
      shopId: req.user.shopId
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
    if (discountValue !== undefined) rule.discountValue = parseFloat(discountValue);
    if (scope !== undefined) rule.scope = scope;
    if (targetName !== undefined) rule.targetName = String(targetName).trim();
    if (targetId !== undefined) rule.targetId = targetId ? parseInt(targetId, 10) : null;
    if (minQuantity !== undefined) rule.minQuantity = parseInt(minQuantity, 10);
    if (minAmount !== undefined) rule.minAmount = parseFloat(minAmount);
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
