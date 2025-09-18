const { logActivity } = require('../middleware/logger');
const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const Category = require('../models/Category');

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { active: true },
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, active: true },
      include: [{ model: Category, attributes: ['id', 'name'] }]
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
      CategoryId
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
      CategoryId
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
      where: { id: req.params.id, active: true }
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
      CategoryId
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
      where: { id: req.params.id, active: true }
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
      where: { id: req.params.id, active: true }
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
