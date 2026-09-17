const { validationResult } = require('express-validator');
const { Category, Shop } = require('../models');

async function resolveTenantContext(req) {
  const shopId = req.shopId || req.user?.shopId;
  let organizationId = req.organizationId || req.user?.organizationId;
  if (!organizationId && shopId) {
    const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
    organizationId = shop?.organizationId;
  }
  return { shopId, organizationId };
}

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const { shopId, organizationId } = await resolveTenantContext(req);
    const where = { active: true };
    if (organizationId) {
      where.organizationId = organizationId;
    } else if (shopId) {
      where.shopId = shopId;
    }

    const categories = await Category.findAll({ where });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

// Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const { shopId, organizationId } = await resolveTenantContext(req);
    const where = { id: req.params.id, active: true };
    if (organizationId) {
      where.organizationId = organizationId;
    } else if (shopId) {
      where.shopId = shopId;
    }

    const category = await Category.findOne({ where });
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category' });
  }
};

// Create category
exports.createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { shopId, organizationId } = await resolveTenantContext(req);
    const { name, description } = req.body;
    const category = await Category.create({
      name,
      description,
      shopId,
      organizationId
    });
    res.status(201).json(category);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Failed to create category' });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { shopId, organizationId } = await resolveTenantContext(req);
    const { name, description } = req.body;
    const where = { id: req.params.id, active: true };
    if (organizationId) {
      where.organizationId = organizationId;
    } else if (shopId) {
      where.shopId = shopId;
    }

    const category = await Category.findOne({ where });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    await category.update({ name, description });
    res.json(category);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Failed to update category' });
  }
};

// Delete category (soft delete)
exports.deleteCategory = async (req, res) => {
  try {
    const { shopId, organizationId } = await resolveTenantContext(req);
    const where = { id: req.params.id, active: true };
    if (organizationId) {
      where.organizationId = organizationId;
    } else if (shopId) {
      where.shopId = shopId;
    }

    const category = await Category.findOne({ where });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    await category.update({ active: false });
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
};
