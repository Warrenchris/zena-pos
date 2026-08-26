const express = require('express');
const router = express.Router();
const { PurchaseOrder, Purchase, Product, sequelize } = require('../models');
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');

// All routes require authentication + shop context (tenant isolation)
router.use(auth);

// Helper to generate PO numbers
const generatePoNumber = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PO-2026-${timestamp}${random}`;
};

// GET /api/purchase-orders — List all POs for the authenticated user's shop
router.get('/', async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const { search, status } = req.query;

    const whereClause = { shopId };
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }
    if (search) {
      whereClause[Op.or] = [
        { poNumber: { [Op.like]: `%${search}%` } },
        { supplierName: { [Op.like]: `%${search}%` } }
      ];
    }

    const orders = await PurchaseOrder.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

// GET /api/purchase-orders/:id — Fetch single PO (scoped to the caller's shop)
router.get('/:id', async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const order = await PurchaseOrder.findOne({ where: { id: req.params.id, shopId } });
    if (!order) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

// POST /api/purchase-orders — Create PO with strict input validation & duplicate check
router.post('/', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.shopId || req.user.shopId;
    const {
      poNumber: customPo,
      supplierName,
      supplierEmail,
      supplierPhone,
      orderDate,
      expectedDeliveryDate,
      status = 'ORDERED',
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
      return res.status(400).json({ error: 'At least one product item is required for purchase order' });
    }

    // Strict Validation 3: Line items validation
    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qtyOrdered = parseInt(item.quantityOrdered || item.quantity, 10);
      const unitCost = parseFloat(item.unitCost);

      if (isNaN(qtyOrdered) || qtyOrdered <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: `Item #${i + 1} (${item.productName || 'Product'}) has invalid ordered quantity. Must be a positive integer greater than 0.` });
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
        quantityOrdered: qtyOrdered,
        quantityReceived: parseInt(item.quantityReceived || 0, 10),
        unitCost: unitCost,
        subtotal: qtyOrdered * unitCost
      });
    }

    const totalAmount = validatedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const poNumber = customPo ? customPo.trim() : await generatePoNumber();

    // Check duplicate PO number (within this shop)
    const existingPo = await PurchaseOrder.findOne({ where: { poNumber, shopId }, transaction });
    if (existingPo) {
      await transaction.rollback();
      return res.status(409).json({ error: `Purchase Order number '${poNumber}' already exists` });
    }

    const po = await PurchaseOrder.create({
      shopId,
      poNumber,
      supplierName: supplierName.trim(),
      supplierEmail: supplierEmail ? supplierEmail.trim() : null,
      supplierPhone: supplierPhone ? supplierPhone.trim() : null,
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      status,
      totalAmount,
      notes: notes ? notes.trim() : null,
      items: validatedItems
    }, { transaction });

    await transaction.commit();
    res.status(201).json(po);
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error creating purchase order:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Duplicate purchase order number' });
    }
    res.status(500).json({ error: error.message || 'Failed to create purchase order' });
  }
});

// PATCH /api/purchase-orders/:id/status — Update PO Status (Supports Full & Partial Receiving with atomic stock delta increments)
router.patch('/:id/status', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.shopId || req.user.shopId;
    const { status, receivedItems } = req.body;
    const po = await PurchaseOrder.findOne({ where: { id: req.params.id, shopId }, transaction });

    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    const currentItems = po.items || [];
    let updatedItems = [];
    const stockDeltas = [];

    if (Array.isArray(receivedItems) && receivedItems.length > 0) {
      // Partial or full itemized receiving logic
      for (const curItem of currentItems) {
        const recMatch = receivedItems.find(r => r.productId === curItem.productId || (r.sku && r.sku === curItem.sku));
        const prevRec = parseInt(curItem.quantityReceived || 0, 10);
        let newRec = prevRec;

        if (recMatch) {
          const specifiedQty = parseInt(recMatch.quantityReceived, 10);
          if (isNaN(specifiedQty) || specifiedQty < 0) {
            await transaction.rollback();
            return res.status(400).json({ error: `Invalid received quantity for ${curItem.productName}` });
          }
          newRec = specifiedQty;
        } else if (status === 'RECEIVED') {
          newRec = parseInt(curItem.quantityOrdered || 0, 10);
        }

        const delta = newRec - prevRec;
        if (delta > 0 && curItem.productId) {
          stockDeltas.push({ productId: curItem.productId, productName: curItem.productName, delta, unitCost: curItem.unitCost });
        }

        updatedItems.push({
          ...curItem,
          quantityReceived: newRec
        });
      }
    } else if (status === 'RECEIVED') {
      // Full receive all items
      for (const curItem of currentItems) {
        const prevRec = parseInt(curItem.quantityReceived || 0, 10);
        const ordered = parseInt(curItem.quantityOrdered || 0, 10);
        const delta = Math.max(0, ordered - prevRec);

        if (delta > 0 && curItem.productId) {
          stockDeltas.push({ productId: curItem.productId, productName: curItem.productName, delta, unitCost: curItem.unitCost });
        }

        updatedItems.push({
          ...curItem,
          quantityReceived: ordered
        });
      }
    } else {
      updatedItems = currentItems;
    }

    // Determine new status based on fulfillment ratio
    let finalStatus = status || po.status;
    const totalOrdered = updatedItems.reduce((s, i) => s + (parseInt(i.quantityOrdered, 10) || 0), 0);
    const totalReceived = updatedItems.reduce((s, i) => s + (parseInt(i.quantityReceived, 10) || 0), 0);

    if (totalReceived >= totalOrdered && totalOrdered > 0) {
      finalStatus = 'RECEIVED';
    } else if (totalReceived > 0 && totalReceived < totalOrdered) {
      finalStatus = 'PARTIALLY_RECEIVED';
    }

    po.status = finalStatus;
    po.items = updatedItems;
    await po.save({ transaction });

    // Atomically increment stock for newly received delta quantities & log purchase
    if (stockDeltas.length > 0) {
      for (const sd of stockDeltas) {
        const product = await Product.findOne({ where: { id: sd.productId, shopId }, transaction });
        if (product) {
          await product.increment('stockQuantity', { by: sd.delta, transaction });
        }
      }

      // Create linked Purchase log for the newly received items
      const purchaseRef = `PUR-${po.poNumber.replace('PO-', '')}-${Date.now().toString().slice(-4)}`;
      await Purchase.create({
        shopId,
        referenceNo: purchaseRef,
        supplierName: po.supplierName,
        supplierContact: po.supplierPhone || po.supplierEmail,
        purchaseDate: new Date(),
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        paymentMethod: 'BANK TRANSFER',
        totalAmount: stockDeltas.reduce((s, d) => s + (d.delta * (d.unitCost || 0)), 0),
        notes: `Generated from PO ${po.poNumber} (${finalStatus})`,
        items: stockDeltas.map(d => ({
          productId: d.productId,
          productName: d.productName,
          quantity: d.delta,
          unitCost: d.unitCost || 0,
          totalCost: d.delta * (d.unitCost || 0)
        }))
      }, { transaction });
    }

    await transaction.commit();
    res.json(po);
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error updating purchase order status:', error);
    res.status(500).json({ error: error.message || 'Failed to update purchase order status' });
  }
});

// DELETE /api/purchase-orders/:id — Delete PO
router.delete('/:id', async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const po = await PurchaseOrder.findOne({ where: { id: req.params.id, shopId } });
    if (!po) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    await po.destroy();
    res.json({ message: 'Purchase Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
});

module.exports = router;
