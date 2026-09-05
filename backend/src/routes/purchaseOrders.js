const express = require('express');
const router = express.Router();
const { PurchaseOrder, PurchaseOrderItem, Purchase, PurchaseItem, Product, Supplier, sequelize } = require('../models');
const { Op } = require('sequelize');
const { auth, checkRole } = require('../middleware/auth');
const { logActivity } = require('../middleware/logger');
const {
  resolveSupplier,
  applyStockReceipt,
  invalidateShopProductCache
} = require('../services/purchaseService');

// All routes require authentication
router.use(auth);

// Helper to generate PO numbers
const generatePoNumber = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PO-2026-${timestamp}${random}`;
};

// GET /api/purchase-orders — List all POs with pagination & server-side summary KPIs
router.get('/', checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      return res.status(403).json({ error: 'Shop context required' });
    }

    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClause = { shopId };

    if (status && status !== 'ALL') {
      whereClause.status = status;
    }
    if (search && search.trim()) {
      whereClause[Op.or] = [
        { poNumber: { [Op.like]: `%${search.trim()}%` } },
        { supplierName: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const validSortFields = ['createdAt', 'orderDate', 'expectedDeliveryDate', 'totalAmount', 'poNumber', 'supplierName', 'status'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await PurchaseOrder.findAndCountAll({
      where: whereClause,
      include: [
        { model: PurchaseOrderItem, as: 'lineItems' },
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'phone', 'email'] }
      ],
      order: [[orderField, orderDirection]],
      limit: parsedLimit,
      offset,
      distinct: true
    });

    // Genuine server-side summary KPIs for the shop
    const [summaryData] = await sequelize.query(`
      SELECT 
        COUNT(CASE WHEN status IN ('ORDERED', 'PARTIALLY_RECEIVED') THEN 1 END) AS activeOrdersCount,
        COALESCE(SUM(CASE WHEN status IN ('ORDERED', 'PARTIALLY_RECEIVED') THEN totalAmount ELSE 0 END), 0) AS committedValue,
        COUNT(CASE WHEN status = 'RECEIVED' THEN 1 END) AS completedOrdersCount,
        COUNT(*) AS totalOrdersCount
      FROM PurchaseOrders
      WHERE shopId = :shopId
    `, { replacements: { shopId } });

    res.json({
      data: rows,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: count,
        totalPages: Math.ceil(count / parsedLimit) || 1
      },
      summary: summaryData[0] || {
        activeOrdersCount: 0,
        committedValue: 0,
        completedOrdersCount: 0,
        totalOrdersCount: 0
      }
    });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

// GET /api/purchase-orders/:id — Fetch single PO
router.get('/:id', checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      return res.status(403).json({ error: 'Shop context required' });
    }

    const order = await PurchaseOrder.findOne({
      where: { id: req.params.id, shopId },
      include: [
        { model: PurchaseOrderItem, as: 'lineItems' },
        { model: Supplier, as: 'supplier' }
      ]
    });

    if (!order) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

// POST /api/purchase-orders — Create PO with strict input validation & line items
router.post('/', checkRole(['admin', 'manager']), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Shop context required' });
    }

    const {
      poNumber: customPo,
      supplierId,
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
      const qtyOrdered = parseFloat(item.quantityOrdered || item.quantity);
      const unitCost = parseFloat(item.unitCost);

      if (isNaN(qtyOrdered) || qtyOrdered <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: `Item #${i + 1} (${item.productName || 'Product'}) has invalid ordered quantity. Must be a positive number greater than 0.` });
      }

      if (isNaN(unitCost) || unitCost < 0) {
        await transaction.rollback();
        return res.status(400).json({ error: `Item #${i + 1} (${item.productName || 'Product'}) has invalid unit cost. Must be a non-negative number.` });
      }

      let matchedProduct = null;
      if (item.productId) {
        matchedProduct = await Product.findOne({ where: { id: item.productId, shopId }, transaction });
        if (!matchedProduct) {
          await transaction.rollback();
          return res.status(404).json({ error: `Product ID ${item.productId} not found in shop inventory` });
        }
      }

      const subtotal = Math.round(qtyOrdered * unitCost * 100) / 100;
      validatedItems.push({
        productId: matchedProduct ? matchedProduct.id : null,
        productName: matchedProduct ? matchedProduct.name : (item.productName || 'Product').trim(),
        sku: matchedProduct ? matchedProduct.sku : (item.sku || '').trim(),
        quantityOrdered: qtyOrdered,
        quantityReceived: 0.00,
        unitCost: unitCost,
        subtotal
      });
    }

    const totalAmount = Math.round(validatedItems.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    const poNumber = customPo ? customPo.trim() : await generatePoNumber();

    // Check duplicate PO number (within this shop)
    const existingPo = await PurchaseOrder.findOne({ where: { poNumber, shopId }, transaction });
    if (existingPo) {
      await transaction.rollback();
      return res.status(409).json({ error: `Purchase Order number '${poNumber}' already exists in this shop` });
    }

    // Resolve or create Supplier
    const supplierRecord = await resolveSupplier({
      shopId,
      supplierId,
      supplierName,
      supplierContact: supplierPhone,
      supplierEmail,
      supplierPhone
    }, transaction);

    const po = await PurchaseOrder.create({
      shopId,
      poNumber,
      supplierId: supplierRecord ? supplierRecord.id : null,
      supplierName: supplierName.trim(),
      supplierEmail: supplierEmail ? supplierEmail.trim() : null,
      supplierPhone: supplierPhone ? supplierPhone.trim() : null,
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      status: (status === 'DRAFT' || status === 'ORDERED') ? status : 'ORDERED',
      totalAmount,
      notes: notes ? notes.trim() : null,
      items: validatedItems
    }, { transaction });

    // Create relational PurchaseOrderItems
    for (const vItem of validatedItems) {
      await PurchaseOrderItem.create({
        purchaseOrderId: po.id,
        productId: vItem.productId,
        productName: vItem.productName,
        sku: vItem.sku,
        quantityOrdered: vItem.quantityOrdered,
        quantityReceived: 0.00,
        unitCost: vItem.unitCost,
        subtotal: vItem.subtotal,
        shopId
      }, { transaction });
    }

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PO_CREATED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: `Created Purchase Order ${po.poNumber} for ${po.supplierName} (${totalAmount})`
    }, transaction);

    await transaction.commit();

    // Reload with associations
    const completePo = await PurchaseOrder.findOne({
      where: { id: po.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }]
    });

    res.status(201).json(completePo);
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

// PUT /api/purchase-orders/:id — Edit PO if still in DRAFT or ORDERED status
router.put('/:id', checkRole(['admin', 'manager']), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Shop context required' });
    }

    const po = await PurchaseOrder.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ error: `Cannot edit a purchase order in ${po.status} status` });
    }

    const { supplierName, supplierEmail, supplierPhone, expectedDeliveryDate, notes } = req.body;

    if (supplierName && supplierName.trim()) po.supplierName = supplierName.trim();
    if (supplierEmail !== undefined) po.supplierEmail = supplierEmail ? supplierEmail.trim() : null;
    if (supplierPhone !== undefined) po.supplierPhone = supplierPhone ? supplierPhone.trim() : null;
    if (expectedDeliveryDate !== undefined) po.expectedDeliveryDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;
    if (notes !== undefined) po.notes = notes ? notes.trim() : null;

    await po.save({ transaction });

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PO_UPDATED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: `Updated Purchase Order ${po.poNumber}`
    }, transaction);

    await transaction.commit();
    res.json(po);
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error updating purchase order:', error);
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
});

// PATCH /api/purchase-orders/:id/receive — Itemized or full receiving with row locks and stock delta tracking
router.patch('/:id/receive', checkRole(['admin', 'manager']), async (req, res) => {
  return handleReceiveOperation(req, res);
});

// Support PATCH /:id/status for lifecycle transitions (DRAFT -> ORDERED, CANCELLED, RECEIVED)
router.patch('/:id/status', checkRole(['admin', 'manager']), async (req, res) => {
  const { status } = req.body;
  const shopId = req.shopId || req.user?.shopId;
  if (!shopId) {
    return res.status(403).json({ error: 'Shop context required' });
  }

  if (status === 'CANCELLED') {
    return handleCancelOperation(req, res);
  }

  if (status === 'ORDERED') {
    const po = await PurchaseOrder.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }]
    });
    if (!po) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    if (po.status !== 'DRAFT') {
      return res.status(400).json({ error: `Cannot transition PO from ${po.status} to ORDERED` });
    }
    po.status = 'ORDERED';
    await po.save();

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PO_ORDERED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: `Moved Purchase Order ${po.poNumber} to ORDERED`
    });

    return res.json(po);
  }

  if (status === 'RECEIVED') {
    return handleReceiveOperation(req, res);
  }

  return res.status(400).json({ error: `Unsupported status transition to ${status}` });
});

/**
 * Core thread-safe receiving engine with row locking and strict remaining-quantity validation
 */
async function handleReceiveOperation(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Shop context required' });
    }

    // Row-level lock on the PO to prevent concurrent duplicate receiving requests
    const po = await PurchaseOrder.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    if (po.status === 'RECEIVED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'This Purchase Order has already been fully received' });
    }

    if (po.status === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cannot receive stock on a cancelled Purchase Order' });
    }

    const receivedItems = req.body.receivedItems || req.body.items;
    const dbLineItems = po.lineItems && po.lineItems.length > 0 ? po.lineItems : [];
    const jsonItems = Array.isArray(po.items) ? [...po.items] : [];

    const stockReceiptBatch = [];
    let anyReceived = false;

    if (Array.isArray(receivedItems) && receivedItems.length > 0) {
      // Partial / itemized receiving: validate each received item
      for (const rec of receivedItems) {
        const pId = rec.productId ? parseInt(rec.productId, 10) : null;
        const lineItem = dbLineItems.find(li => (pId && li.productId === pId) || (rec.sku && li.sku === rec.sku) || li.productName === rec.productName);

        if (!lineItem) continue;

        const ordered = parseFloat(lineItem.quantityOrdered || 0);
        const currentRec = parseFloat(lineItem.quantityReceived || 0);
        const remaining = Math.max(0, Math.round((ordered - currentRec) * 100) / 100);

        // Client may supply delta to receive ("quantityToReceive") or new cumulative ("quantityReceived")
        let delta = 0;
        if (rec.quantityToReceive !== undefined) {
          delta = parseFloat(rec.quantityToReceive);
        } else if (rec.quantityReceived !== undefined) {
          const targetTotal = parseFloat(rec.quantityReceived);
          delta = Math.round((targetTotal - currentRec) * 100) / 100;
        }

        if (isNaN(delta) || delta < 0) {
          await transaction.rollback();
          return res.status(400).json({ error: `Invalid quantity specified for ${lineItem.productName}` });
        }

        if (delta > remaining) {
          await transaction.rollback();
          return res.status(400).json({
            error: `Cannot receive ${delta} units of ${lineItem.productName}. Maximum remaining to receive is ${remaining}.`
          });
        }

        if (delta > 0) {
          anyReceived = true;
          const newRecTotal = Math.round((currentRec + delta) * 100) / 100;
          lineItem.quantityReceived = newRecTotal;
          await lineItem.save({ transaction });

          // Update jsonItems representation as well
          const jIdx = jsonItems.findIndex(ji => (pId && ji.productId === pId) || ji.productName === lineItem.productName);
          if (jIdx >= 0) {
            jsonItems[jIdx].quantityReceived = newRecTotal;
          }

          stockReceiptBatch.push({
            productId: lineItem.productId,
            productName: lineItem.productName,
            sku: lineItem.sku,
            quantity: delta,
            unitCost: parseFloat(lineItem.unitCost || 0),
            totalCost: Math.round(delta * parseFloat(lineItem.unitCost || 0) * 100) / 100
          });
        }
      }
    } else {
      // Full receive all remaining items
      for (const lineItem of dbLineItems) {
        const ordered = parseFloat(lineItem.quantityOrdered || 0);
        const currentRec = parseFloat(lineItem.quantityReceived || 0);
        const remaining = Math.max(0, Math.round((ordered - currentRec) * 100) / 100);

        if (remaining > 0) {
          anyReceived = true;
          lineItem.quantityReceived = ordered;
          await lineItem.save({ transaction });

          const jIdx = jsonItems.findIndex(ji => ji.productId === lineItem.productId || ji.productName === lineItem.productName);
          if (jIdx >= 0) {
            jsonItems[jIdx].quantityReceived = ordered;
          }

          stockReceiptBatch.push({
            productId: lineItem.productId,
            productName: lineItem.productName,
            sku: lineItem.sku,
            quantity: remaining,
            unitCost: parseFloat(lineItem.unitCost || 0),
            totalCost: Math.round(remaining * parseFloat(lineItem.unitCost || 0) * 100) / 100
          });
        }
      }
    }

    if (!anyReceived) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No new quantities were specified to receive' });
    }

    // Determine final status based on fulfillment ratio
    const totalOrdered = dbLineItems.reduce((s, li) => s + parseFloat(li.quantityOrdered || 0), 0);
    const totalReceived = dbLineItems.reduce((s, li) => s + parseFloat(li.quantityReceived || 0), 0);

    let finalStatus = 'PARTIALLY_RECEIVED';
    if (totalReceived >= totalOrdered && totalOrdered > 0) {
      finalStatus = 'RECEIVED';
    }

    po.status = finalStatus;
    po.items = jsonItems;
    await po.save({ transaction });

    // Apply stock increments & weighted average costing
    await applyStockReceipt({
      shopId,
      items: stockReceiptBatch,
      reference: `PO ${po.poNumber}`,
      userId: req.user?.id
    }, transaction);

    await invalidateShopProductCache(shopId);

    // Auto-create a linked Purchase record representing this receiving batch
    const purchaseRef = `PUR-${po.poNumber.replace('PO-', '')}-${Date.now().toString().slice(-4)}`;
    const batchTotalAmount = Math.round(stockReceiptBatch.reduce((s, i) => s + i.totalCost, 0) * 100) / 100;

    const generatedPurchase = await Purchase.create({
      shopId,
      referenceNo: purchaseRef,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      supplierContact: po.supplierPhone || po.supplierEmail,
      purchaseDate: new Date(),
      status: 'RECEIVED',
      paymentStatus: 'PAID',
      paymentMethod: 'BANK TRANSFER',
      totalAmount: batchTotalAmount,
      paidAmount: batchTotalAmount,
      notes: `Generated from PO ${po.poNumber} (${finalStatus})`,
      items: stockReceiptBatch
    }, { transaction });

    for (const sItem of stockReceiptBatch) {
      await PurchaseItem.create({
        purchaseId: generatedPurchase.id,
        productId: sItem.productId,
        productName: sItem.productName,
        sku: sItem.sku,
        quantity: sItem.quantity,
        unitCost: sItem.unitCost,
        totalCost: sItem.totalCost,
        shopId
      }, { transaction });
    }

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: finalStatus === 'RECEIVED' ? 'PO_FULLY_RECEIVED' : 'PO_PARTIALLY_RECEIVED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: `Received ${stockReceiptBatch.reduce((s, i) => s + i.quantity, 0)} units on PO ${po.poNumber}. Status is now ${finalStatus}.`
    }, transaction);

    await transaction.commit();

    // Reload with updated lineItems
    const updatedPo = await PurchaseOrder.findOne({
      where: { id: po.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }]
    });

    res.json(updatedPo);
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error receiving purchase order:', error);
    res.status(500).json({ error: error.message || 'Failed to receive purchase order' });
  }
}

// PATCH /api/purchase-orders/:id/cancel — Cancel PO
router.patch('/:id/cancel', checkRole(['admin', 'manager']), async (req, res) => {
  return handleCancelOperation(req, res);
});

async function handleCancelOperation(req, res) {
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) return res.status(403).json({ error: 'Shop context required' });

    const po = await PurchaseOrder.findOne({ where: { id: req.params.id, shopId } });
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    if (po.status === 'RECEIVED') {
      return res.status(400).json({ error: 'Cannot cancel a fully received Purchase Order' });
    }
    if (po.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Purchase Order is already cancelled' });
    }

    po.status = 'CANCELLED';
    await po.save();

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PO_CANCELLED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: `Cancelled Purchase Order ${po.poNumber}`
    });

    res.json({ message: 'Purchase Order cancelled successfully', po });
  } catch (error) {
    console.error('Error cancelling purchase order:', error);
    res.status(500).json({ error: 'Failed to cancel purchase order' });
  }
}

// DELETE /api/purchase-orders/:id — Delete PO (only if not received)
router.delete('/:id', checkRole(['admin']), async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) return res.status(403).json({ error: 'Shop context required' });

    const po = await PurchaseOrder.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }]
    });

    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    if (po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') {
      return res.status(400).json({
        error: 'Cannot delete a Purchase Order with received goods. Cancel or adjust records instead.'
      });
    }

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PO_DELETED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: `Deleted Purchase Order ${po.poNumber}`
    });

    await po.destroy();
    res.json({ message: 'Purchase Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
});

module.exports = router;
