const { logActivity } = require('../middleware/logger');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Product = require('../models/Product');
const Category = require('../models/Category');

// Get all products with filters and pagination
exports.getAllProducts = async (req, res) => {
  try {
    const {
      search,
      categoryId,
      availability, // 'in_stock' | 'low_stock' | 'out_of_stock'
      minPrice,
      maxPrice,
      page = 1,
      pageSize = 12,
    } = req.query;

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericPageSize = Math.min(Math.max(parseInt(pageSize, 10) || 12, 1), 100);

    const where = {
      active: true,
      shopId: req.user.shopId,
    };

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: term } },
        { sku: { [Op.like]: term } },
        { barcode: { [Op.like]: term } },
      ];
    }

    if (categoryId) {
      where.CategoryId = parseInt(categoryId, 10);
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
      if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
    }

    if (availability === 'in_stock') {
      where.stockQuantity = { [Op.gt]: 0 };
    } else if (availability === 'low_stock') {
      // stockQuantity <= reorderPoint and > 0
      where[Op.and] = [
        { stockQuantity: { [Op.gt]: 0 } },
        { stockQuantity: { [Op.lte]: { [Op.col]: 'reorderPoint' } } },
      ];
    } else if (availability === 'out_of_stock') {
      where.stockQuantity = 0;
    }

    const include = [
      { model: Category, attributes: ['id', 'name'], where: { shopId: req.user.shopId } },
    ];

    const offset = (numericPage - 1) * numericPageSize;

    const { rows, count } = await Product.findAndCountAll({
      where,
      include,
      limit: numericPageSize,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    const totalPages = Math.ceil(count / numericPageSize) || 1;

    res.json({
      products: rows,
      pagination: {
        currentPage: numericPage,
        totalPages,
        total: count,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId },
      include: [{ model: Category, attributes: ['id', 'name'], where: { shopId: req.user.shopId } }]
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

// Create product
exports.createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId,
      expirationDate
    } = req.body;

    const product = await Product.create({
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId,
      expirationDate: expirationDate || null,
      shopId: req.user.shopId
    });

    const productWithCategory = await Product.findOne({
      where: { id: product.id },
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });

    res.status(201).json(productWithCategory);
    try { await logActivity(req, 'PRODUCT_CREATED', 'Product', product.id, { sku }); } catch (_) {}
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'SKU or barcode already exists' });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const {
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId
    } = req.body;

    await product.update({
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId,
      expirationDate: expirationDate || null
    });

    const updatedProduct = await Product.findOne({
      where: { id: product.id },
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });

    res.json(updatedProduct);
    try { await logActivity(req, 'PRODUCT_UPDATED', 'Product', product.id, {}); } catch (_) {}
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'SKU or barcode already exists' });
    }
    res.status(500).json({ error: 'Failed to update product' });
  }
};

// Delete product (soft delete)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.update({ active: false });
    res.json({ message: 'Product deleted successfully' });
    try { await logActivity(req, 'PRODUCT_DELETED', 'Product', product.id, {}); } catch (_) {}
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

// Update stock quantity
exports.updateStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity } = req.body;
    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newQuantity = product.stockQuantity + parseInt(quantity);
    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    await product.update({ stockQuantity: newQuantity });
    res.json(product);
    try { await logActivity(req, 'STOCK_ADJUSTED', 'Product', product.id, { delta: parseInt(quantity) }); } catch (_) {}
  } catch (error) {
    res.status(500).json({ error: 'Failed to update stock' });
  }
};
