const express = require('express');
const router = express.Router();
const { Purchase, Product, sequelize } = require('../models');
const { Op } = require('sequelize');

// Helper to generate reference numbers
const generateRefNo = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PUR-2026-${timestamp}${random}`;
};

// GET /api/purchases — List all purchases
router.get('/', async (req, res) => {
  try {
    const { search, status, paymentStatus } = req.query;

    const whereClause = {};
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

    let purchases = await Purchase.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // If database is empty, seed demo purchases for initial immediate view
    if (purchases.length === 0 && !search && !status && !paymentStatus) {
      const demoPurchases = [
        {
          referenceNo: 'PUR-2026-8801',
          supplierName: 'Kenyan Beverages Distributors Ltd',
          supplierContact: '+254711223344',
          purchaseDate: new Date(Date.now() - 86400000 * 2),
          status: 'RECEIVED',
          paymentStatus: 'PAID',
          paymentMethod: 'M-PESA',
          totalAmount: 45600.00,
          notes: 'Regular weekly soft drinks restock',
          items: [
            { productId: 1, productName: 'Coca-Cola Soda 1.25L', sku: 'CC-1250ML', quantity: 120, unitCost: 280, totalCost: 33600 },
            { productId: 2, productName: 'Safari Lager Beer 500ml', sku: 'SL-500ML', quantity: 60, unitCost: 200, totalCost: 12000 }
          ]
        },
        {
          referenceNo: 'PUR-2026-8802',
          supplierName: 'Highland Grain Millers',
          supplierContact: '+254733445566',
          purchaseDate: new Date(Date.now() - 86400000 * 5),
          status: 'RECEIVED',
          paymentStatus: 'PAID',
          paymentMethod: 'BANK TRANSFER',
          totalAmount: 78000.00,
          notes: 'Maize flour 2kg & Wheat flour bundles',
          items: [
            { productId: 3, productName: 'Ungamill Premium Maize Flour 2kg', sku: 'UM-2KG', quantity: 300, unitCost: 260, totalCost: 78000 }
          ]
        },
        {
          referenceNo: 'PUR-2026-8803',
          supplierName: 'Eldoret Dairy Co-operative',
          supplierContact: '+254722889900',
          purchaseDate: new Date(Date.now() - 86400000 * 1),
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentMethod: 'CREDIT',
          totalAmount: 18500.00,
          notes: 'Fresh Milk & Fresh Yoghurt crates awaiting delivery',
          items: [
            { productId: 4, productName: 'Fresh Whole Milk 500ml', sku: 'FM-500ML', quantity: 200, unitCost: 65, totalCost: 13000 },
            { productId: 5, productName: 'Strawberry Yoghurt 250ml', sku: 'SY-250ML', quantity: 50, unitCost: 110, totalCost: 5500 }
          ]
        }
      ];

      await Purchase.bulkCreate(demoPurchases);
      purchases = await Purchase.findAll({ order: [['createdAt', 'DESC']] });
    }

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// GET /api/purchases/:id — Fetch single purchase
router.get('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findByPk(req.params.id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }
    res.json(purchase);
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

// POST /api/purchases — Create a purchase and update stock
router.post('/', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      supplierName,
      supplierContact,
      purchaseDate,
      status = 'RECEIVED',
      paymentStatus = 'PAID',
      paymentMethod = 'CASH',
      notes,
      items = []
    } = req.body;

    if (!supplierName || !supplierName.trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'At least one product item is required' });
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity || 0);
      const cost = parseFloat(item.unitCost || 0);
      return sum + (qty * cost);
    }, 0);

    const referenceNo = await generateRefNo();

    const purchase = await Purchase.create({
      referenceNo,
      supplierName: supplierName.trim(),
      supplierContact: supplierContact ? supplierContact.trim() : null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      status,
      paymentStatus,
      paymentMethod,
      totalAmount,
      notes: notes ? notes.trim() : null,
      items
    }, { transaction });

    // If status is RECEIVED, update stock quantity for each product
    if (status === 'RECEIVED') {
      for (const item of items) {
        if (item.productId) {
          const product = await Product.findByPk(item.productId, { transaction });
          if (product) {
            const addQty = parseInt(item.quantity || 0, 10);
            if (!isNaN(addQty) && addQty > 0) {
              await product.increment('stockQuantity', { by: addQty, transaction });
            }
          }
        }
      }
    }

    await transaction.commit();
    res.status(201).json(purchase);
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to create purchase' });
  }
});

// DELETE /api/purchases/:id — Delete purchase
router.delete('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findByPk(req.params.id);
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
