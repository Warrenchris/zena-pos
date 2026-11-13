const express = require('express');
const router = express.Router();
const { Purchase, PurchaseItem, PurchaseOrder, PurchaseOrderItem, Product, Supplier, Shop, sequelize } = require('../models');
const { Op } = require('sequelize');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const { logActivity } = require('../middleware/logger');
const {
  resolveSupplier,
  applyStockReceipt,
  reverseStockReceipt,
  recordPaymentExpense,
  reversePaymentExpense,
  validatePurchasePayment,
  invalidateShopProductCache
} = require('../services/purchaseService');
const { invalidateShopInsightsCache } = require('../services/insightsCacheService');

// All routes require authentication, canonical authorization context, and active subscription
router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

// Helper to generate reference numbers
const generateRefNo = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PUR-2026-${timestamp}${random}`;
};

// GET /api/purchases — List paginated purchases with server-side KPIs
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
      paymentStatus,
      startDate,
      endDate,
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
    if (paymentStatus && paymentStatus !== 'ALL') {
      whereClause.paymentStatus = paymentStatus;
    }
    if (search && search.trim()) {
      whereClause[Op.or] = [
        { referenceNo: { [Op.like]: `%${search.trim()}%` } },
        { supplierName: { [Op.like]: `%${search.trim()}%` } }
      ];
    }
    if (startDate || endDate) {
      whereClause.purchaseDate = {};
      if (startDate) {
        whereClause.purchaseDate[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        whereClause.purchaseDate[Op.lte] = endD;
      }
    }

    const validSortFields = ['createdAt', 'purchaseDate', 'totalAmount', 'referenceNo', 'supplierName', 'status', 'paymentStatus'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await Purchase.findAndCountAll({
      where: whereClause,
      include: [
        { model: PurchaseItem, as: 'lineItems' },
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'phone', 'email'] }
      ],
      order: [[orderField, orderDirection]],
      limit: parsedLimit,
      offset,
      distinct: true
    });

    // Compute genuine server-side summary KPIs for the entire shop
    const [summaryData] = await sequelize.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN totalAmount ELSE 0 END), 0) AS totalPurchasesAmount,
        COUNT(CASE WHEN status = 'RECEIVED' THEN 1 END) AS receivedStockCount,
        COUNT(CASE WHEN status IN ('PENDING', 'PARTIALLY_RECEIVED') THEN 1 END) AS pendingDeliveriesCount,
        COUNT(DISTINCT supplierName) AS activeSuppliersCount
      FROM Purchases
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
        totalPurchasesAmount: 0,
        receivedStockCount: 0,
        pendingDeliveriesCount: 0,
        activeSuppliersCount: 0
      }
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// GET /api/purchases/:id — Fetch single purchase
router.get('/:id',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Purchase.findByPk(req.params.id, {
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

    const purchase = await Purchase.findOne({
      where: { id: req.params.id, shopId },
      include: [
        { model: PurchaseItem, as: 'lineItems' },
        { model: Supplier, as: 'supplier' }
      ]
    });

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
      referenceNo: customRef,
      supplierId,
      supplierName,
      supplierContact,
      purchaseDate,
      status = 'RECEIVED',
      paymentStatus = 'PAID',
      paymentMethod = 'CASH',
      paidAmount: initialPaidAmount,
      notes,
      items = []
    } = req.body;

    if (!['PENDING', 'RECEIVED'].includes(status)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Status must be PENDING or RECEIVED' });
    }

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
      const qty = parseFloat(item.quantity);
      const unitCost = parseFloat(item.unitCost);

      if (isNaN(qty) || qty <= 0) {
        await transaction.rollback();
        return res.status(400).json({ error: `Item #${i + 1} (${item.productName || 'Product'}) has invalid quantity. Must be a positive number greater than 0.` });
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

      const lineTotal = Math.round(qty * unitCost * 100) / 100;
      validatedItems.push({
        productId: matchedProduct ? matchedProduct.id : null,
        productName: matchedProduct ? matchedProduct.name : (item.productName || 'Product').trim(),
        sku: matchedProduct ? matchedProduct.sku : (item.sku || '').trim(),
        quantity: qty,
        unitCost: unitCost,
        totalCost: lineTotal
      });
    }

    // Calculate total amount
    const totalAmount = Math.round(validatedItems.reduce((sum, item) => sum + item.totalCost, 0) * 100) / 100;
    const referenceNo = customRef ? customRef.trim() : await generateRefNo();

    // Check duplicate reference number (within this shop)
    const existingRef = await Purchase.findOne({ where: { referenceNo, shopId }, transaction });
    if (existingRef) {
      await transaction.rollback();
      return res.status(409).json({ error: `Purchase reference '${referenceNo}' already exists in this shop` });
    }

    const paymentValidation = validatePurchasePayment({
      paymentStatus,
      paymentMethod,
      paidAmount: initialPaidAmount,
      totalAmount
    });
    if (paymentValidation.error) {
      await transaction.rollback();
      return res.status(400).json({ error: paymentValidation.error });
    }
    const parsedPaidAmount = paymentValidation.paidAmount;

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
      supplierContact
    }, transaction);

    const purchase = await Purchase.create({
      shopId,
      referenceNo,
      supplierId: supplierRecord ? supplierRecord.id : null,
      supplierName: supplierName.trim(),
      supplierContact: supplierContact ? supplierContact.trim() : null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      status,
      paymentStatus: paymentValidation.paymentStatus,
      paymentMethod: paymentValidation.paymentMethod,
      totalAmount,
      paidAmount: parsedPaidAmount,
      notes: notes ? notes.trim() : null,
      items: validatedItems
    }, { transaction });

    // Create normalized relational line items
    for (const vItem of validatedItems) {
      await PurchaseItem.create({
        purchaseId: purchase.id,
        productId: vItem.productId,
        productName: vItem.productName,
        sku: vItem.sku,
        quantity: vItem.quantity,
        unitCost: vItem.unitCost,
        totalCost: vItem.totalCost,
        shopId
      }, { transaction });
    }

    // If status is RECEIVED, update stock quantity and weighted average cost atomically
    if (status === 'RECEIVED') {
      await applyStockReceipt({
        shopId,
        items: validatedItems,
        reference: purchase.referenceNo,
        userId: req.user?.id,
        organizationId
      }, transaction);
      await invalidateShopProductCache(shopId);
      await invalidateShopInsightsCache(organizationId, shopId);
    }

    // If payment was made, record in financial ledger (Expenses)
    if (parsedPaidAmount > 0) {
      await recordPaymentExpense({
        shopId,
        organizationId,
        purchase,
        amount: parsedPaidAmount,
        paymentMethod: paymentValidation.paymentMethod,
        userId: req.user?.id
      }, transaction);
    }

    // Log Activity
    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PURCHASE_CREATED',
      entity: 'Purchase',
      entityId: purchase.id,
      details: `Created purchase ${purchase.referenceNo} for ${purchase.supplierName} (${formatCurrencyAmount(totalAmount)})`
    }, transaction);

    await transaction.commit();

    // Reload with associations for clean response
    const completePurchase = await Purchase.findOne({
      where: { id: purchase.id, shopId },
      include: [{ model: PurchaseItem, as: 'lineItems' }]
    });

    res.status(201).json(completePurchase);
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

// PUT /api/purchases/:id — Update purchase notes / metadata
router.put('/:id',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Purchase.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => {
  try {
    const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
    if (!shopId) return res.status(403).json({ error: 'Shop context required' });

    const purchase = await Purchase.findOne({ where: { id: req.params.id, shopId } });
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    if (purchase.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot modify a cancelled purchase' });
    }

    const { notes, supplierContact, purchaseDate } = req.body;
    if (notes !== undefined) purchase.notes = notes ? notes.trim() : null;
    if (supplierContact !== undefined) purchase.supplierContact = supplierContact ? supplierContact.trim() : null;
    if (purchaseDate) purchase.purchaseDate = new Date(purchaseDate);

    await purchase.save();

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PURCHASE_UPDATED',
      entity: 'Purchase',
      entityId: purchase.id,
      details: `Updated purchase ${purchase.referenceNo}`
    });

    res.json(purchase);
  } catch (error) {
    console.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

// PATCH /api/purchases/:id/receive — Mark pending purchase as received and increment inventory atomically
router.patch('/:id/receive',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Purchase.findByPk(req.params.id, {
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
    const organizationId = req.authz?.tenant?.organizationId;

    const purchase = await Purchase.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseItem, as: 'lineItems' }],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!purchase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.status === 'RECEIVED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Purchase is already marked as received' });
    }

    if (purchase.status === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cannot receive stock for a cancelled purchase' });
    }

    const itemsToReceive = purchase.lineItems && purchase.lineItems.length > 0
      ? purchase.lineItems
      : (purchase.items || []);

    // Apply stock increments and update weighted average cost
    await applyStockReceipt({
      shopId,
      items: itemsToReceive,
      reference: purchase.referenceNo,
      userId: req.user?.id,
      organizationId
    }, transaction);

    purchase.status = 'RECEIVED';
    await purchase.save({ transaction });

    await invalidateShopProductCache(shopId);
    await invalidateShopInsightsCache(organizationId, shopId);

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PURCHASE_RECEIVED',
      entity: 'Purchase',
      entityId: purchase.id,
      details: `Received inventory goods for purchase ${purchase.referenceNo}`
    }, transaction);

    await transaction.commit();
    res.json(purchase);
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error receiving purchase stock:', error);
    res.status(500).json({ error: error.message || 'Failed to receive purchase' });
  }
});

// POST /api/purchases/:id/payments — Record installment or complete payment on a purchase
router.post('/:id/payments',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Purchase.findByPk(req.params.id, {
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
    const organizationId = req.authz?.tenant?.organizationId;

    const purchase = await Purchase.findOne({
      where: { id: req.params.id, shopId },
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!purchase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.status === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cannot record payment for a cancelled purchase' });
    }

    const { amount, paymentMethod = 'CASH' } = req.body;
    const payAmount = parseFloat(amount);

    if (isNaN(payAmount) || payAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Payment amount must be a positive number' });
    }

    const totalAmount = parseFloat(purchase.totalAmount || 0);
    const currentPaid = parseFloat(purchase.paidAmount || 0);
    const outstanding = Math.max(0, Math.round((totalAmount - currentPaid) * 100) / 100);

    if (payAmount > outstanding) {
      await transaction.rollback();
      return res.status(400).json({ error: `Payment of ${payAmount} exceeds outstanding balance of ${outstanding}` });
    }

    const newPaidAmount = Math.round((currentPaid + payAmount) * 100) / 100;
    purchase.paidAmount = newPaidAmount;
    purchase.paymentStatus = newPaidAmount >= totalAmount ? 'PAID' : 'PARTIAL';
    purchase.paymentMethod = paymentMethod;

    await purchase.save({ transaction });

    // Record in Expenses table
    await recordPaymentExpense({
      shopId,
      organizationId,
      purchase,
      amount: payAmount,
      paymentMethod,
      userId: req.user?.id
    }, transaction);

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PURCHASE_PAYMENT_RECORDED',
      entity: 'Purchase',
      entityId: purchase.id,
      details: `Recorded payment of ${payAmount} for purchase ${purchase.referenceNo}`
    }, transaction);

    await transaction.commit();
    const balanceRemaining = Math.max(0, Math.round((parseFloat(purchase.totalAmount || 0) - newPaidAmount) * 100) / 100);
    res.json({
      ...purchase.toJSON(),
      outstandingBalance: balanceRemaining
    });
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error recording purchase payment:', error);
    res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
});

// PATCH /api/purchases/:id/cancel — Safely cancel a purchase and reverse inventory if previously received
router.patch('/:id/cancel',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Purchase.findByPk(req.params.id, {
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
    const organizationId = req.authz?.tenant?.organizationId;

    const purchase = await Purchase.findOne({
      where: { id: req.params.id, shopId },
      include: [{ model: PurchaseItem, as: 'lineItems' }],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!purchase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.status === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Purchase is already cancelled' });
    }

    const itemsToReverse = purchase.lineItems && purchase.lineItems.length > 0
      ? purchase.lineItems
      : (purchase.items || []);

    await reversePurchaseOrderReceipt({ purchase, items: itemsToReverse, shopId, transaction });

    // If stock was previously received, atomically reverse inventory & record reversal movements
    if (purchase.status === 'RECEIVED') {
      await reverseStockReceipt({
        shopId,
        items: itemsToReverse,
        reference: purchase.referenceNo,
        userId: req.user?.id,
        organizationId
      }, transaction);

      await invalidateShopProductCache(shopId);
      await invalidateShopInsightsCache(organizationId, shopId);
    }

    await reversePaymentExpense({ shopId, organizationId, purchase, userId: req.user?.id }, transaction);

    purchase.status = 'CANCELLED';
    await purchase.save({ transaction });

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'PURCHASE_CANCELLED',
      entity: 'Purchase',
      entityId: purchase.id,
      details: `Cancelled purchase ${purchase.referenceNo} and reversed any received inventory stock`
    }, transaction);

    await transaction.commit();
    res.json({ message: 'Purchase cancelled and stock reversed successfully', purchase });
  } catch (error) {
    if (transaction.finished !== 'commit' && transaction.finished !== 'rollback') {
      await transaction.rollback();
    }
    console.error('Error cancelling purchase:', error);
    const response = { error: error.message || 'Failed to cancel purchase' };
    if (error.shortages) response.shortages = error.shortages;
    res.status(error.statusCode || 500).json(response);
  }
});

async function reversePurchaseOrderReceipt({ purchase, items, shopId, transaction }) {
  if (!purchase.purchaseOrderId) {
    return;
  }

  const po = await PurchaseOrder.findOne({
    where: { id: purchase.purchaseOrderId, shopId },
    lock: transaction.LOCK.UPDATE,
    transaction
  });
  if (!po) {
    throw new Error(`Purchase Order ${purchase.purchaseOrderId} linked to purchase ${purchase.referenceNo} was not found`);
  }

  const poItems = await PurchaseOrderItem.findAll({
    where: { purchaseOrderId: po.id, shopId },
    order: [['id', 'ASC']],
    lock: transaction.LOCK.UPDATE,
    transaction
  });
  const receivedByProduct = new Map();
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = parseFloat(item.quantity || item.quantityReceived || 0);
    if (!item.productId || quantity <= 0) continue;
    receivedByProduct.set(productId, (receivedByProduct.get(productId) || 0) + quantity);
  }

  for (const [productId, quantity] of receivedByProduct) {
    let remaining = quantity;
    for (const poItem of poItems.filter(item => Number(item.productId) === productId)) {
      const currentReceived = parseFloat(poItem.quantityReceived || 0);
      const reversed = Math.min(currentReceived, remaining);
      if (reversed > 0) {
        poItem.quantityReceived = Math.max(0, Math.round((currentReceived - reversed) * 100) / 100);
        await poItem.save({ transaction });
        remaining -= reversed;
      }
      if (remaining <= 0) break;
    }
  }

  const poJsonItems = Array.isArray(po.items) ? po.items.map(item => ({ ...item })) : [];
  for (const [productId, quantity] of receivedByProduct) {
    let remaining = quantity;
    for (const item of poJsonItems.filter(entry => Number(entry.productId) === productId)) {
      const currentReceived = parseFloat(item.quantityReceived || 0);
      const reversed = Math.min(currentReceived, remaining);
      if (reversed > 0) {
        item.quantityReceived = Math.max(0, Math.round((currentReceived - reversed) * 100) / 100);
        remaining -= reversed;
      }
      if (remaining <= 0) break;
    }
  }

  if (po.status !== 'CANCELLED') {
    const totalOrdered = poItems.reduce((sum, item) => sum + parseFloat(item.quantityOrdered || 0), 0);
    const totalReceived = poItems.reduce((sum, item) => sum + parseFloat(item.quantityReceived || 0), 0);
    po.status = totalReceived <= 0
      ? 'ORDERED'
      : totalOrdered > 0 && totalReceived < totalOrdered
        ? 'PARTIALLY_RECEIVED'
        : 'RECEIVED';
  }
  po.items = poJsonItems;
  await po.save({ transaction });
}

// DELETE /api/purchases/:id — Soft-cancel and audit (enforces inventory integrity)
router.delete('/:id',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Purchase.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      antiOracle: true
    }
  }),
  async (req, res) => res.status(405).json({ error: 'Use PATCH /api/purchases/:id/cancel' })
);

function formatCurrencyAmount(val) {
  return typeof val === 'number' ? val.toFixed(2) : String(val);
}

module.exports = router;
