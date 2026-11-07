const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { PurchaseOrder, PurchaseOrderItem, Purchase, PurchaseItem, Product, Supplier, Shop, sequelize } = require('../models');
const { Op } = require('sequelize');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const { logActivity } = require('../middleware/logger');
const {
  resolveSupplier,
  applyStockReceipt,
  invalidateShopProductCache
} = require('../services/purchaseService');
const {
  ReceiptValidationError,
  validateReceiptBatch,
  createReceiptRequestHash,
  validateReceiptRequestId,
  buildReceiptReference,
  buildReceiptRequestPrefix
} = require('../services/purchaseOrderReceiving');
const { invalidateShopInsightsCache } = require('../services/insightsCacheService');

// All routes require authentication, canonical authorization context, and active subscription
router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

// Helper to generate PO numbers
const generatePoNumber = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PO-2026-${timestamp}${random}`;
};

// GET /api/purchase-orders — List all POs with pagination & server-side summary KPIs
router.get('/',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    shopScope: 'current'
  }),
  async (req, res) => {
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
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
router.get('/:id',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => PurchaseOrder.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
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
router.post('/',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    shopScope: (req) => req.body?.shopId || req.authz?.scope?.activeShopId || req.shopId
  }),
  async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.body?.shopId || req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
    if (!shopId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Shop context required' });
    }
    const organizationId = req.authz?.tenant?.organizationId;

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
        matchedProduct = await Product.findOne({
          where: organizationId ? { id: item.productId, organizationId } : { id: item.productId, shopId },
          transaction
        });
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

    // Explicit supplier validation if supplierId provided
    if (supplierId) {
      const existingSupplier = await Supplier.findOne({
        where: organizationId ? { id: supplierId, organizationId } : { id: supplierId, shopId },
        transaction
      });
      if (!existingSupplier) {
        await transaction.rollback();
        return res.status(404).json({ error: `Supplier ID ${supplierId} not found in this organization` });
      }
    }

    // Resolve or create Supplier
    const supplierRecord = await resolveSupplier({
      shopId,
      organizationId,
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
router.put('/:id',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => PurchaseOrder.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
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
router.patch('/:id/receive',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => PurchaseOrder.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  return handleReceiveOperation(req, res);
});

// Support PATCH /:id/status for lifecycle transitions (DRAFT -> ORDERED, CANCELLED, RECEIVED)
router.patch('/:id/status',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => PurchaseOrder.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  const { status } = req.body;
  const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
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
    return handleReceiveOperation(req, res, { forceReceiveAll: true });
  }

  return res.status(400).json({ error: `Unsupported status transition to ${status}` });
});

/**
 * Core thread-safe receiving engine.
 *
 * New clients send cumulative quantityReceived targets and a stable requestId.
 * A retry therefore resolves to a zero delta, while the request reference provides
 * durable idempotency without adding schema columns or changing existing tables.
 * Legacy quantityToReceive delta payloads remain supported.
 */
async function handleReceiveOperation(req, res, { forceReceiveAll = false } = {}) {
  const transaction = await sequelize.transaction();
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
    if (!shopId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Shop context required' });
    }
    const organizationId = req.authz?.tenant?.organizationId;
    const po = await PurchaseOrder.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }],
      order: [[{ model: PurchaseOrderItem, as: 'lineItems' }, 'id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    if (po.status === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cannot receive stock on a cancelled Purchase Order' });
    }

    const body = req.body || {};
    if (body.receivedItems !== undefined && body.items !== undefined) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Provide receivedItems or items, not both' });
    }

    const receivedItems = body.receivedItems !== undefined ? body.receivedItems : body.items;
    const receiveAll = forceReceiveAll || body.receiveAll === true;
    let requestId;
    try {
      requestId = validateReceiptRequestId(body.requestId);
    } catch (validationError) {
      await transaction.rollback();
      return res.status(400).json({ error: validationError.message });
    }

    const requestHash = createReceiptRequestHash({
      receivedItems: Array.isArray(receivedItems) ? receivedItems : null,
      receiveAll
    });

    // A matching request key is checked while holding the PO lock. This makes
    // a retried request return its original result rather than applying stock twice.
    if (requestId) {
      const requestPrefix = buildReceiptRequestPrefix({ purchaseOrderId: po.id, requestId });
      const existingReceipt = await Purchase.findOne({
        where: {
          shopId,
          referenceNo: { [Op.like]: `${requestPrefix}%` }
        },
        transaction
      });

      if (existingReceipt) {
        const expectedReference = buildReceiptReference({
          purchaseOrderId: po.id,
          requestId,
          requestHash
        });
        await transaction.rollback();

        if (existingReceipt.referenceNo !== expectedReference) {
          return res.status(409).json({
            error: 'This receipt request ID was already used with a different receiving payload'
          });
        }

        const currentPo = await PurchaseOrder.findOne({
          where: { id: po.id, shopId },
          include: [{ model: PurchaseOrderItem, as: 'lineItems' }],
          order: [[{ model: PurchaseOrderItem, as: 'lineItems' }, 'id', 'ASC']]
        });
        if (!currentPo) return res.status(404).json({ error: 'Purchase Order not found' });
        return res.json({ ...currentPo.toJSON(), idempotentReplay: true });
      }
    }

    let receiptBatch;
    try {
      receiptBatch = validateReceiptBatch({
        lineItems: po.lineItems || [],
        receivedItems,
        receiveAll
      });
    } catch (validationError) {
      await transaction.rollback();
      if (validationError instanceof ReceiptValidationError) {
        return res.status(validationError.statusCode).json({ error: validationError.message });
      }
      throw validationError;
    }

    const stockReceiptBatch = [];
    const jsonItems = Array.isArray(po.items) ? [...po.items] : [];

    for (const receipt of receiptBatch) {
      if (receipt.delta <= 0) continue;

      const { lineItem, delta, newQuantityReceived } = receipt;
      lineItem.quantityReceived = newQuantityReceived;
      await lineItem.save({ transaction });

      const lineItemIndex = po.lineItems.findIndex(item => String(item.id) === String(lineItem.id));
      let jsonIndex = jsonItems.length === po.lineItems.length ? lineItemIndex : -1;
      if (jsonIndex < 0) {
        const matchingIndexes = jsonItems.reduce((matches, item, index) => {
          const sameProduct = lineItem.productId !== null && lineItem.productId !== undefined
            && String(item.productId) === String(lineItem.productId);
          const sameSku = Boolean(lineItem.sku && item.sku && item.sku === lineItem.sku);
          const sameName = item.productName === lineItem.productName;
          if (sameName && (sameSku || sameProduct)) matches.push(index);
          return matches;
        }, []);
        if (matchingIndexes.length === 1) jsonIndex = matchingIndexes[0];
      }
      if (jsonIndex >= 0) {
        jsonItems[jsonIndex] = {
          ...jsonItems[jsonIndex],
          quantityReceived: newQuantityReceived
        };
      }

      const unitCost = Number(lineItem.unitCost || 0);
      stockReceiptBatch.push({
        productId: lineItem.productId,
        productName: lineItem.productName,
        sku: lineItem.sku,
        quantity: delta,
        unitCost,
        totalCost: Math.round(delta * unitCost * 100) / 100
      });
    }

    // A repeated cumulative payload is a successful no-op, including when the
    // PO was fully received by the original request.
    if (stockReceiptBatch.length === 0) {
      await transaction.rollback();
      const currentPo = await PurchaseOrder.findOne({
        where: { id: po.id, shopId },
        include: [{ model: PurchaseOrderItem, as: 'lineItems' }],
        order: [[{ model: PurchaseOrderItem, as: 'lineItems' }, 'id', 'ASC']]
      });
      if (!currentPo) return res.status(404).json({ error: 'Purchase Order not found' });
      return res.json({ ...currentPo.toJSON(), idempotentReplay: true });
    }

    if (po.status === 'RECEIVED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'This Purchase Order has already been fully received' });
    }

    const totalOrdered = po.lineItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
    const totalReceived = po.lineItems.reduce((sum, item) => sum + Number(item.quantityReceived || 0), 0);
    const finalStatus = totalOrdered > 0 && totalReceived >= totalOrdered
      ? 'RECEIVED'
      : 'PARTIALLY_RECEIVED';

    po.status = finalStatus;
    po.items = jsonItems;
    await po.save({ transaction });

    await applyStockReceipt({
      shopId,
      items: stockReceiptBatch,
      reference: `PO ${po.poNumber}`,
      userId: req.user?.id,
      organizationId
    }, transaction);

    const batchTotalAmount = Math.round(
      stockReceiptBatch.reduce((sum, item) => sum + item.totalCost, 0) * 100
    ) / 100;

    const purchaseRef = requestId
      ? buildReceiptReference({ purchaseOrderId: po.id, requestId, requestHash })
      : `PUR-${po.poNumber.replace('PO-', '')}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // This Purchase represents goods received, not money paid. A later payment
    // must be explicitly recorded through /api/purchases/:id/payments.
    const generatedPurchase = await Purchase.create({
      shopId,
      referenceNo: purchaseRef,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      supplierContact: po.supplierPhone || po.supplierEmail,
      purchaseDate: new Date(),
      status: 'RECEIVED',
      paymentStatus: 'UNPAID',
      paymentMethod: null,
      totalAmount: batchTotalAmount,
      paidAmount: 0,
      notes: `Goods received from PO ${po.poNumber}. Supplier payment has not been recorded.`,
      items: stockReceiptBatch
    }, { transaction });

    for (const item of stockReceiptBatch) {
      await PurchaseItem.create({
        purchaseId: generatedPurchase.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
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
      details: `Received ${stockReceiptBatch.reduce((sum, item) => sum + item.quantity, 0)} units on PO ${po.poNumber}. Status is now ${finalStatus}.`
    }, transaction);

    await transaction.commit();

    await invalidateShopProductCache(shopId);
    await invalidateShopInsightsCache(organizationId, shopId);

    const updatedPo = await PurchaseOrder.findOne({
      where: { id: po.id, shopId },
      include: [{ model: PurchaseOrderItem, as: 'lineItems' }],
      order: [[{ model: PurchaseOrderItem, as: 'lineItems' }, 'id', 'ASC']]
    });
    if (!updatedPo) return res.status(404).json({ error: 'Purchase Order not found after receiving' });

    return res.json({ ...updatedPo.toJSON(), idempotentReplay: false });
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error receiving purchase order:', error);
    return res.status(500).json({ error: error.message || 'Failed to receive purchase order' });
  }
}

// PATCH /api/purchase-orders/:id/cancel — Cancel PO
router.patch('/:id/cancel',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => PurchaseOrder.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  return handleCancelOperation(req, res);
});

async function handleCancelOperation(req, res) {
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
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
router.delete('/:id',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => PurchaseOrder.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
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
