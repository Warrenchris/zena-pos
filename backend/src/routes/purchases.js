const express = require('express');
const router = express.Router();
const { Purchase, Product, sequelize } = require('../models');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');

// All routes require authentication + shop context (tenant isolation)
router.use(auth);

// Helper to generate reference numbers
const generateRefNo = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PUR-2026-${timestamp}${random}`;
};

// GET /api/purchases — List all purchases for the authenticated user's shop
router.get('/', async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const { search, status, paymentStatus } = req.query;

    const whereClause = { shopId };
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }
    if (paymentStatus && paymentStatus !== 'ALL') {
      whereClause.paymentStatus = paymentStatus;
    }
    if (search) {
      whereClause[Op.or] = [
        { referenceNo: { [Op.like]: `%${search}%` } },
        { supplierName: { [Op.like]: `%${search}%` } }
      ];
    }

    const purchases = await Purchase.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// GET /api/purchases/:id — Fetch single purchase (scoped to the caller's shop)
router.get('/:id', async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const purchase = await Purchase.findOne({ where: { id: req.params.id, shopId } });
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }
    res.json(purchase);
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

// POST /api/purchases — Create a purchase and update stock with atomic transaction & strict input validation
router.post('/', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.shopId || req.user.shopId;
    const {
      referenceNo: customRef,
      supplierName,
      supplierContact,
      purchaseDate,
      status = 'RECEIVED',
      paymentStatus = 'PAID',
      paymentMethod = 'CASH',
      notes,
      items = []
    } = req.body;

    // Strict Validation 1: Supplier Name
    if (!supplierName || typeof supplierName !== 'string' || !supplierName.trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Supplier name is required and must be a valid text string' });
    }

    // Strict Validation 2: Non-empty items array
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'At least one product item is required for purchase' });
    }

    // Strict Validation 3: Validate each line item (quantity, unitCost, product existence)
    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = parseInt(item.quantity, 10);
      const unitCost = parseFloat(item.unitCost);

      if (isNaN(qty) || qty <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: `Item #${i + 1} (${item.productName || 'Product'}) has invalid quantity. Must be a positive integer greater than 0.` });
      }

      if (isNaN(unitCost) || unitCost < 0) {
        await transaction.rollback();
        return res.status(400).json({ error: `Item #${i + 1} (${item.productName || 'Product'}) has invalid unit cost. Must be a non-negative number.` });
      }

      if (item.productId) {
        const product = await Product.findOne({ where: { id: item.productId, shopId }, transaction });
        if (!product) {
          await transaction.rollback();
          return res.status(404).json({ error: `Product ID ${item.productId} not found in inventory` });
        }
      }

      validatedItems.push({
        productId: item.productId || null,
        productName: item.productName || 'Product',
        sku: item.sku || '',
        quantity: qty,
        unitCost: unitCost,
        totalCost: qty * unitCost
      });
    }

    // Calculate total amount
    const totalAmount = validatedItems.reduce((sum, item) => sum + item.totalCost, 0);

    const referenceNo = customRef ? customRef.trim() : await generateRefNo();

    // Check duplicate reference number (within this shop)
    const existingRef = await Purchase.findOne({ where: { referenceNo, shopId }, transaction });
    if (existingRef) {
      await transaction.rollback();
      return res.status(409).json({ error: `Purchase reference '${referenceNo}' already exists` });
    }

    const purchase = await Purchase.create({
      shopId,
      referenceNo,
      supplierName: supplierName.trim(),
      supplierContact: supplierContact ? supplierContact.trim() : null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      status,
      paymentStatus,
      paymentMethod,
      totalAmount,
      notes: notes ? notes.trim() : null,
      items: validatedItems
    }, { transaction });

    // If status is RECEIVED, update stock quantity for each product atomically
    if (status === 'RECEIVED') {
      for (const item of validatedItems) {
        if (item.productId) {
          const product = await Product.findOne({ where: { id: item.productId, shopId }, transaction });
          if (product) {
            await product.increment('stockQuantity', { by: item.quantity, transaction });
          }
        }
      }
    }

    await transaction.commit();
    res.status(201).json(purchase);
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error creating purchase:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Duplicate purchase reference number' });
    }
    res.status(500).json({ error: error.message || 'Failed to create purchase' });
  }
});

// DELETE /api/purchases/:id — Delete purchase
router.delete('/:id', async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const purchase = await Purchase.findOne({ where: { id: req.params.id, shopId } });
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    await purchase.destroy();
    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

module.exports = router;
