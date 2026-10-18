const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Customer = require('../models/Customer');
const sequelize = require('../config/database');
const { logActivity } = require('../middleware/logger');
const Employee = require('../models/Employee');
const UuidHelper = require('../utils/uuidHelper');
const User = require('../models/User');
const SaleRefund = require('../models/SaleRefund');
const SalePayment = require('../models/SalePayment');
const SystemSettings = require('../models/SystemSettings');
const Inventory = require('../models/Inventory');
const StockMovement = require('../models/StockMovement');
const { Shop } = require('../models');
const RefundIdempotency = require('../models/RefundIdempotency');
const logger = require('../utils/logger');
const { parseDate } = require('../utils/dateUtils');
const { WALK_IN_CUSTOMER_NAME } = require('../constants/customer');
const { discountRequiresApproval, verifyDiscountApprovalIfNeeded } = require('../utils/discountApproval');
const { invalidateAnalyticsCache } = require('../utils/analyticsCache');
const { invalidateShopProductCache } = require('../services/productCache');
const { invalidateShopInsightsCache } = require('../services/insightsCacheService');
const {
  normalizeIdempotencyKey,
  generateSaleFingerprint,
  generateRefundFingerprint,
  isIdempotencyUniqueError,
  isRefundIdempotencyUniqueError
} = require('../utils/idempotencyUtils');
const { isIntegerId } = require('../utils/idKind');
const { REALIZED_SALE_FILTER, withSaleFilter } = require('../constants/saleFilters');

const round2 = (num) => Math.round((parseFloat(num || 0) + Number.EPSILON) * 100) / 100;

const fetchCompleteSaleByIdempotencyKey = async (idempotencyKey, shopId) => {
  return Sale.findOne({
    where: {
      idempotencyKey,
      shopId
    },
    attributes: {
      exclude: ['UserId', 'CustomerId']
    },
    include: [
      {
        model: SaleItem,
        include: [{
          model: Product,
          attributes: ['id', 'name', 'sku', 'price']
        }]
      },
      {
        model: Customer,
        attributes: ['id', 'name', 'email', 'phone', 'location', 'loyaltyPoints']
      },
      {
        model: Employee,
        attributes: ['id', 'firstName', 'lastName', 'email'],
        as: 'Employee'
      }
    ]
  });
};

// Get all sales with pagination
exports.getAllSales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get the sales with their items
    const sales = await Sale.findAndCountAll({
      where: {
        shopId: req.user.shopId
      },
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false, // Make this LEFT JOIN to get sales even without items
          include: [{
            model: Product,
            required: false, // Also make this LEFT JOIN
            attributes: ['id', 'name', 'sku', 'price']
          }]
        },
        {
          model: Customer,
          required: false, // Make this a LEFT JOIN
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        },
        {
          model: User,
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
      distinct: true, // This ensures correct count with eager loading
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      sales: sales.rows,
      total: sales.count,
      totalPages: Math.ceil(sales.count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

const reverseSaleFinancialsIfNeeded = async (sale, processedRefunds, reqUser, shopId, resolvedOrgId, t) => {
  if (
    sale.saleStatus === 'cancelled' ||
    sale.status === 'cancelled' ||
    sale.saleStatus === 'refunded' ||
    sale.metadata?.financialsReversed === true ||
    sale.metadata?.stockReversed === true ||
    sale.metadata?.isDeleted === true
  ) {
    return;
  }

  const isUnfulfilledStatus =
    ['pending', 'confirmed', 'processing'].includes(sale.saleStatus) ||
    sale.status === 'pending' ||
    sale.fulfillmentStatus === 'failed';

  if (isUnfulfilledStatus && sale.paymentStatus !== 'completed') {
    return;
  }

  const saleTotal = round2(Math.max(0, parseFloat(sale.total || 0)));
  if (saleTotal <= 0) {
    return;
  }

  const refundsList = Array.isArray(processedRefunds)
    ? processedRefunds
    : await SaleRefund.findAll({
        where: { saleId: sale.id, status: 'processed' },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

  const alreadyRefundedAmount = round2(
    refundsList.reduce((sum, sr) => sum + parseFloat(sr.amount || 0), 0)
  );

  const existingPayments = await SalePayment.findAll({
    where: { saleId: sale.id, shopId },
    lock: t.LOCK.UPDATE,
    transaction: t
  });

  const alreadyCancelReversedAmount = round2(
    existingPayments
      .filter(p => p.metadata?.isCancelReversal === true || String(p.paymentReference || '').startsWith('CANCEL-'))
      .reduce((sum, p) => sum + Math.abs(parseFloat(p.amount || 0)), 0)
  );

  const remainingAmountToReverse = round2(
    Math.max(0, saleTotal - alreadyRefundedAmount - alreadyCancelReversedAmount)
  );

  if (remainingAmountToReverse <= 0) {
    return;
  }

  const paymentMethod = (sale.paymentMethod === 'mobile' || sale.paymentMethod === 'mobile_money')
    ? 'mobile_money'
    : (sale.paymentMethod || 'cash');

  const rawPerformerId = String(reqUser?.id || '');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawPerformerId);
  const processedBy = (reqUser?.isEmployee && isUuid) ? rawPerformerId : null;

  await SalePayment.create({
    saleId: sale.id,
    shopId,
    amount: -remainingAmountToReverse,
    paymentMethod,
    paymentReference: `CANCEL-${sale.invoiceNumber || sale.id}`,
    paymentProvider: 'System Cancellation Reversal',
    status: 'completed',
    processedBy,
    paidAt: new Date(),
    metadata: {
      isCancelReversal: true,
      cancelledBy: rawPerformerId
    }
  }, { transaction: t });

  if (sale.customerId) {
    const customerWhere = resolvedOrgId
      ? { id: sale.customerId, [Op.or]: [{ organizationId: resolvedOrgId }, { shopId }] }
      : { id: sale.customerId };

    const customerRecord = await Customer.findOne({
      where: customerWhere,
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (customerRecord) {
      const refundPaymentReversals = existingPayments.filter(p => p.metadata?.isRefundReversal === true);
      const pointsDeductedByPaymentRows = refundPaymentReversals.reduce(
        (sum, p) => sum + Math.floor(Math.abs(parseFloat(p.amount || 0))),
        0
      );
      const alreadyDeductedPoints =
        Math.max(pointsDeductedByPaymentRows, Math.floor(alreadyRefundedAmount)) +
        Math.floor(alreadyCancelReversedAmount);
      const pointsToReverse = Math.max(0, Math.floor(saleTotal) - alreadyDeductedPoints);

      const newTotalPurchases = round2(
        Math.max(0, parseFloat(customerRecord.totalPurchases || 0) - remainingAmountToReverse)
      );
      const newLoyaltyPoints = Math.max(
        0,
        (parseInt(customerRecord.loyaltyPoints || 0, 10) || 0) - pointsToReverse
      );

      await customerRecord.update({
        totalPurchases: newTotalPurchases,
        loyaltyPoints: newLoyaltyPoints
      }, { transaction: t });
    }
  }
};

const restoreSaleInventoryIfNeeded = async (sale, reqUser, shopId, organizationId, t) => {
  if (
    sale.saleStatus === 'cancelled' ||
    sale.status === 'cancelled' ||
    sale.saleStatus === 'refunded' ||
    sale.metadata?.stockReversed === true ||
    sale.metadata?.isDeleted === true
  ) {
    return;
  }

  let resolvedOrgId = organizationId || reqUser?.organizationId;
  if (!resolvedOrgId && shopId) {
    const shopRecord = await Shop.findByPk(shopId, { attributes: ['organizationId'], transaction: t });
    resolvedOrgId = shopRecord?.organizationId;
  }

  const isUnfulfilledStatus =
    ['pending', 'confirmed', 'processing'].includes(sale.saleStatus) ||
    sale.status === 'pending' ||
    sale.fulfillmentStatus === 'failed';

  if (isUnfulfilledStatus) {
    const saleRefs = [sale.invoiceNumber, String(sale.id)].filter(Boolean);
    const saleDeductionCount = await StockMovement.count({
      where: {
        shopId,
        type: 'SALE',
        reference: { [Op.in]: saleRefs }
      },
      transaction: t
    });
    if (saleDeductionCount === 0) {
      return;
    }
  }

  const processedRefunds = await SaleRefund.findAll({
    where: { saleId: sale.id, status: 'processed' },
    lock: t.LOCK.UPDATE,
    transaction: t
  });

  const saleItems = await SaleItem.findAll({
    where: { saleId: sale.id },
    lock: t.LOCK.SHARE,
    transaction: t
  });

  if (saleItems && saleItems.length > 0) {
    const soldByProduct = new Map();
    for (const si of saleItems) {
      const prev = soldByProduct.get(si.productId) || 0;
      soldByProduct.set(si.productId, prev + Number(si.quantity || 0));
    }

    const refundedByProduct = new Map();
    for (const sr of processedRefunds) {
      const prev = refundedByProduct.get(sr.productId) || 0;
      refundedByProduct.set(sr.productId, prev + Number(sr.quantity || 0));
    }

    const cancelRefs = [
      sale.invoiceNumber ? `CANCEL-${sale.invoiceNumber}` : null,
      `CANCEL-${sale.id}`
    ].filter(Boolean);

    const existingCancelMovements = await StockMovement.findAll({
      where: {
        shopId,
        type: 'SALE_REFUND',
        reference: { [Op.in]: cancelRefs }
      },
      lock: t.LOCK.UPDATE,
      transaction: t
    });
    const alreadyCancelledByProduct = new Map();
    for (const sm of existingCancelMovements) {
      const prev = alreadyCancelledByProduct.get(sm.productId) || 0;
      alreadyCancelledByProduct.set(sm.productId, prev + Math.abs(Number(sm.quantity || 0)));
    }

    const jwtId = reqUser?.id;
    const resolvedUserId = (typeof jwtId === 'number')
      ? jwtId
      : (typeof jwtId === 'string' && /^\d+$/.test(jwtId))
        ? parseInt(jwtId, 10)
        : null;

    // Sort product IDs in ascending order for deterministic lock acquisition
    const sortedProductEntries = [...soldByProduct.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));

    for (const [productId, soldQty] of sortedProductEntries) {
      const refundedQty = refundedByProduct.get(productId) || 0;
      const alreadyCancelledQty = alreadyCancelledByProduct.get(productId) || 0;
      const qtyToRestore = Math.max(0, soldQty - refundedQty - alreadyCancelledQty);
      if (qtyToRestore <= 0) {
        continue;
      }

      let inventory = await Inventory.findOne({
        where: { productId, shopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      const productWhere = resolvedOrgId
        ? { id: productId, [Op.or]: [{ shopId }, { organizationId: resolvedOrgId }] }
        : { id: productId, shopId };
      const product = await Product.findOne({
        where: productWhere,
        transaction: t
      });

      if (!inventory && product) {
        inventory = await Inventory.create({
          productId: product.id,
          shopId,
          stockQuantity: 0,
          reorderPoint: 10
        }, { transaction: t });
      }

      if (inventory) {
        const prevStock = parseFloat(inventory.stockQuantity || 0);
        const newStock = prevStock + qtyToRestore;
        await inventory.update({ stockQuantity: newStock }, { transaction: t });

        await StockMovement.create({
          shopId,
          organizationId: resolvedOrgId || product?.organizationId,
          productId,
          quantity: qtyToRestore,
          previousStock: prevStock,
          newStock,
          type: 'SALE_REFUND',
          reference: `CANCEL-${sale.invoiceNumber || sale.id}`,
          userId: !reqUser?.isEmployee ? resolvedUserId : null,
          employeeId: reqUser?.isEmployee ? reqUser.id : null
        }, { transaction: t });
      }
    }
  }

  await reverseSaleFinancialsIfNeeded(sale, processedRefunds, reqUser, shopId, resolvedOrgId, t);
};

// Update sale status and notes
exports.updateSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, saleStatus: requestedSaleStatus, notes } = req.body;
    const shopId = req.shopId || req.user?.shopId;
    const organizationId = req.organizationId || req.user?.organizationId;

    const disallowedDirectRefundStatuses = ['refunded', 'partially_refunded', 'partial_refund'];
    if (
      disallowedDirectRefundStatuses.includes(status) ||
      disallowedDirectRefundStatuses.includes(requestedSaleStatus)
    ) {
      await t.rollback();
      return res.status(400).json({
        error: 'Cannot set sale status to refunded directly. Please use the refund endpoint.'
      });
    }

    // Find and lock the sale
    const sale = await Sale.findOne({
      where: {
        id,
        shopId
      },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    const effectiveRequestedStatus = requestedSaleStatus || status;
    const isCancelling = effectiveRequestedStatus === 'cancelled';

    if (
      (sale.saleStatus === 'cancelled' || sale.status === 'cancelled' || sale.metadata?.isDeleted === true) &&
      effectiveRequestedStatus &&
      effectiveRequestedStatus !== 'cancelled'
    ) {
      await t.rollback();
      return res.status(400).json({
        error: 'Cannot transition a cancelled or deleted sale to another status'
      });
    }

    if (isCancelling) {
      await restoreSaleInventoryIfNeeded(sale, req.user, shopId, organizationId, t);
    }

    const validLegacyStatuses = ['pending', 'completed', 'cancelled'];
    const nextLegacyStatus = isCancelling
      ? 'cancelled'
      : (validLegacyStatuses.includes(status) ? status : sale.status);

    const validSaleStatuses = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'];
    const nextSaleStatus = isCancelling
      ? 'cancelled'
      : (validSaleStatuses.includes(effectiveRequestedStatus) ? effectiveRequestedStatus : sale.saleStatus);

    const updatedMetadata = {
      ...(sale.metadata || {}),
      ...(isCancelling
        ? {
            stockReversed: true,
            financialsReversed: true,
            cancelledBy: String(req.user.id)
          }
        : {})
    };

    // Update the sale
    const updatedSale = await sale.update({
      ...(nextLegacyStatus ? { status: nextLegacyStatus } : {}),
      ...(nextSaleStatus ? { saleStatus: nextSaleStatus } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(isCancelling && !sale.cancelledAt ? { cancelledAt: new Date() } : {}),
      lastModifiedBy: String(req.user.id),
      metadata: updatedMetadata
    }, { transaction: t });

    // Log the activity
    await logActivity({
      shopId,
      performedBy: req.user.id,
      performedByType: req.user.isEmployee ? 'employee' : 'user',
      action: 'UPDATE_SALE',
      entity: 'Sale',
      entityId: sale.id,
      details: `Updated sale ${sale.invoiceNumber} status to ${effectiveRequestedStatus || sale.saleStatus}`
    }, t);

    await t.commit();

    // Invalidate analytics and product caches for the shop
    invalidateAnalyticsCache(sale.shopId || shopId);
    if (isCancelling) {
      await invalidateShopProductCache(sale.shopId || shopId);
    }

    res.json(updatedSale);
  } catch (error) {
    await t.rollback();
    console.error('Error updating sale:', error);
    res.status(500).json({ error: 'Failed to update sale' });
  }
};

// Delete a sale (soft delete)
exports.deleteSale = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const shopId = req.shopId || req.user?.shopId;
    const organizationId = req.organizationId || req.user?.organizationId;

    // Find and lock the sale
    const sale = await Sale.findOne({
      where: {
        id,
        shopId
      },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    await restoreSaleInventoryIfNeeded(sale, req.user, shopId, organizationId, t);

    const now = new Date();
    // Mark sale as cancelled/deleted using valid ENUM values and store audit metadata
    await sale.update({
      status: 'cancelled',
      saleStatus: 'cancelled',
      cancelledAt: sale.cancelledAt || now,
      lastModifiedBy: String(req.user.id),
      metadata: {
        ...(sale.metadata || {}),
        isDeleted: true,
        deletedAt: sale.metadata?.deletedAt || now.toISOString(),
        deletedBy: String(req.user.id),
        stockReversed: true,
        financialsReversed: true
      }
    }, { transaction: t });

    // Log the activity
    await logActivity({
      shopId,
      performedBy: req.user.id,
      performedByType: req.user.isEmployee ? 'employee' : 'user',
      action: 'DELETE_SALE',
      entity: 'Sale',
      entityId: sale.id,
      details: `Deleted sale ${sale.invoiceNumber}`
    }, t);

    await t.commit();
    invalidateAnalyticsCache(sale.shopId || shopId);
    await invalidateShopProductCache(sale.shopId || shopId);
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Error deleting sale:', error);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
};


// Get sale by ID
exports.getSaleById = async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId },
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false,
          include: [{
            model: Product,
            attributes: ['id', 'name', 'sku', 'price'],
            required: false
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone', 'loyaltyPoints'],
          required: false
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        },
        {
          model: User,
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
};

// Get all payments for a specific sale
exports.getSalePayments = async (req, res) => {
  try {
    const { saleId } = req.params;
    const shopId = req.shopId || req.user.shopId;

    const sale = await Sale.findOne({
      where: { id: saleId, shopId }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const SalePayment = require('../models/SalePayment');
    const payments = await SalePayment.findAll({
      where: { saleId, shopId }
    });

    res.json(payments);
  } catch (error) {
    console.error('Failed to get sale payments:', error);
    res.status(500).json({ error: 'Failed to fetch sale payments' });
  }
};

// Create new sale
exports.createSale = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const rawKey = req.header('Idempotency-Key') || req.header('idempotency-key') || req.body?.idempotencyKey;
    const idempotencyKey = normalizeIdempotencyKey(rawKey);

    const shopId = req.shopId || req.user?.shopId;
    const organizationId = req.organizationId || req.user?.organizationId;

    const paymentMethod = req.body?.paymentMethod || 'cash';
    let methodKey = null;
    if (paymentMethod === 'cash') {
      methodKey = 'cash';
    } else if (paymentMethod === 'mobile' || paymentMethod === 'mobile_money') {
      methodKey = 'mobile';
    } else if (paymentMethod === 'card' || paymentMethod === 'bank') {
      methodKey = 'bank';
    }

    if (shopId && methodKey) {
      const settings = await SystemSettings.findOne({
        where: { shopId },
        attributes: ['enabledPaymentMethods']
      });
      const enabledPaymentMethods = settings?.enabledPaymentMethods;
      if (enabledPaymentMethods && enabledPaymentMethods[methodKey] === false) {
        return res.status(400).json({
          error: `Payment method '${paymentMethod}' is disabled for this shop`
        });
      }
    }

    const salePayload = {
      ...req.body,
      idempotencyKey
    };

    const completeSale = await exports.createSaleInternal(salePayload, shopId, req.user, organizationId);

    res.status(201).json(completeSale);
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_KEY_REUSED' || error.statusCode === 409) {
      return res.status(409).json({
        code: error.code || 'IDEMPOTENCY_KEY_REUSED',
        message: error.message || 'The idempotency key was already used with a different request.',
        error: error.message || 'The idempotency key was already used with a different request.'
      });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Invoice number conflict. Please retry the sale.' });
    }
    console.error('Sale creation error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Failed to create sale' : error.message
    });
  }
};

exports.createSaleInternal = async (saleData, shopId, user, orgId = null, existingTransaction = null) => {
  let organizationId = orgId || user?.organizationId || saleData.organizationId;
  if (!organizationId && shopId) {
    const Shop = require('../models/Shop');
    const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
    organizationId = shop?.organizationId;
  }

  const {
    items,
    customer,
    customerId,
    paymentMethod,
    paymentAmount,
    discount = 0,
    discountType,
    discountValue,
    discountReason,
    managerApprovalId,
    managerPassword,
    tax,
    notes,
    total: frontendTotal,
    change: frontendChange,
    paymentReference,
    paymentProvider,
    paymentNotes,
    idempotencyKey
  } = saleData;

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Sale must include at least one item');
    err.statusCode = 400;
    throw err;
  }

  // Server-side discount authorization check. The client (DiscountModal.jsx)
  // already gates this in the UI, but that is only a UX convenience — it does
  // not stop a request built by hand or a compromised client from submitting
  // an above-threshold discount with a fabricated approver. Re-check here
  // against the real, hashed credential, exactly like the refund flow does.
  const verifiedApproverName = await verifyDiscountApprovalIfNeeded({
    shopId,
    user,
    cartDiscountType: discountType,
    cartDiscountValue: discountValue,
    items,
    managerApprovalId,
    managerPassword
  });
  const cartDiscountNeedsApproval = discountRequiresApproval(discountType, discountValue);

  const cleanIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const requestHash = generateSaleFingerprint(saleData, shopId);

  // Idempotency check: if sale with this idempotencyKey already exists, verify fingerprint and return immediately
  if (cleanIdempotencyKey) {
    const existingSale = await fetchCompleteSaleByIdempotencyKey(cleanIdempotencyKey, shopId);

    if (existingSale) {
      const existingHash = existingSale.metadata?.requestHash;
      if (existingHash && existingHash !== requestHash) {
        const err = new Error('The idempotency key was already used with a different request.');
        err.statusCode = 409;
        err.code = 'IDEMPOTENCY_KEY_REUSED';
        throw err;
      }
      return existingSale;
    }
  }

  const round2 = (num) => Math.round((parseFloat(num || 0) + Number.EPSILON) * 100) / 100;

  // Retrieve shop settings for tax rate and tax-inclusive setting
  const shopSettings = await SystemSettings.findOne({ where: { shopId } });
  const shopTaxRate = parseFloat(shopSettings?.taxRate !== undefined && shopSettings?.taxRate !== null ? shopSettings.taxRate : 0);
  const isTaxInclusive = Boolean(shopSettings?.taxInclusive);

  const executeSaleCreation = async (t) => {
    let grossSubtotal = 0;
    const lockedProducts = [];
    const intermediateItems = [];

    // Sort items by productId ascending before acquiring Inventory row locks.
    // This matches the lock-acquisition order used by processRefund and
    // restoreSaleInventoryIfNeeded, preventing lock-inversion deadlocks when
    // a concurrent checkout and refund/cancellation share overlapping products (H-01).
    // A shallow copy is used so the caller's original array is never mutated in place.
    const sortedItems = [...items].sort((a, b) => Number(a.productId) - Number(b.productId));

    for (const item of sortedItems) {
      const product = await Product.findOne({
        where: organizationId ? { id: item.productId, active: true, organizationId } : { id: item.productId, active: true, shopId },
        include: [{ model: Category, attributes: ['id', 'taxCategory'] }],
        transaction: t
      });

      if (!product) {
        const err = new Error(`Product ${item.productId} not found`);
        err.statusCode = 400;
        throw err;
      }

      let inventory = await Inventory.findOne({
        where: { productId: product.id, shopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!inventory) {
        logger.warn(`[createSaleInternal] No inventory row found for productId ${product.id} and shopId ${shopId}. Creating explicit default.`);
        inventory = await Inventory.create({
          productId: product.id,
          shopId,
          stockQuantity: 0,
          reorderPoint: 10
        }, { transaction: t });
      }

      if (inventory.stockQuantity < item.quantity) {
        const err = new Error(`Insufficient stock for product: ${product.name}`);
        err.statusCode = 409;
        throw err;
      }

      const itemPrice = parseFloat(product.price);
      const itemQuantity = parseInt(item.quantity, 10);
      const itemGross = itemPrice * itemQuantity;
      const itemDiscount = parseFloat(item.discount || 0);
      const itemNet = Math.max(0, itemGross - itemDiscount);
      grossSubtotal += itemGross;

      // Determine effective tax category and tax rate (Product -> Category -> 'standard')
      const effectiveTaxCategory = product.taxCategory || product.Category?.taxCategory || 'standard';
      const itemTaxRate = effectiveTaxCategory === 'standard' ? shopTaxRate : 0.00;

      lockedProducts.push({ product, inventory, item, itemPrice, itemSubtotal: itemGross });

      intermediateItems.push({
        product,
        item,
        itemPrice,
        itemQuantity,
        itemGross,
        itemDiscount,
        itemNet,
        effectiveTaxCategory,
        itemTaxRate,
        discountApprovedBy: discountRequiresApproval(item.discountType, item.discountValue)
          ? verifiedApproverName
          : null
      });
    }

    const totalItemDiscounts = intermediateItems.reduce((sum, si) => sum + si.itemDiscount, 0);
    const cartDiscountAmount = parseFloat(discount || 0);
    const totalDiscount = round2(totalItemDiscounts + cartDiscountAmount);
    const totalItemsNet = intermediateItems.reduce((sum, si) => sum + si.itemNet, 0);

    // Compute line-item tax and build saleItems
    let totalServerTax = 0;
    const saleItems = [];

    for (const d of intermediateItems) {
      // Allocate cart discount proportionally across items based on net share
      const itemCartDiscount = totalItemsNet > 0 ? (d.itemNet / totalItemsNet) * cartDiscountAmount : 0;
      const taxableBase = Math.max(0, d.itemNet - itemCartDiscount);

      let lineTaxAmount = 0;
      if (d.itemTaxRate > 0) {
        if (isTaxInclusive) {
          // Inclusive: shelf price includes tax -> Tax = TaxableBase * (Rate / (100 + Rate))
          lineTaxAmount = round2(taxableBase * (d.itemTaxRate / (100 + d.itemTaxRate)));
        } else {
          // Exclusive: shelf price is net -> Tax = TaxableBase * (Rate / 100)
          lineTaxAmount = round2(taxableBase * (d.itemTaxRate / 100));
        }
      }

      totalServerTax += lineTaxAmount;

      saleItems.push({
        productId: d.product.id,
        quantity: d.itemQuantity,
        unitPrice: d.itemPrice,
        price: d.itemPrice,
        subtotal: d.itemNet,
        discount: d.itemDiscount,
        discountType: d.item.discountType || null,
        discountValue: d.item.discountValue ? parseFloat(d.item.discountValue) : null,
        discountReason: d.item.discountReason || null,
        discountApprovedBy: d.discountApprovedBy,
        taxRate: d.itemTaxRate,
        taxAmount: lineTaxAmount,
        taxCategory: d.effectiveTaxCategory
      });
    }

    totalServerTax = round2(totalServerTax);

    let serverTotal;
    let finalSaleSubtotal;

    if (isTaxInclusive) {
      serverTotal = round2(Math.max(0, grossSubtotal - totalDiscount));
      finalSaleSubtotal = round2(grossSubtotal - totalServerTax);
    } else {
      serverTotal = round2(Math.max(0, grossSubtotal - totalDiscount + totalServerTax));
      finalSaleSubtotal = round2(grossSubtotal);
    }

    // Verify client total within ±0.02 tolerance
    if (frontendTotal !== undefined && Math.abs(serverTotal - parseFloat(frontendTotal)) > 0.02) {
      const err = new Error(`Price mismatch. Expected ${serverTotal.toFixed(2)}, received ${parseFloat(frontendTotal).toFixed(2)}.`);
      err.statusCode = 400;
      throw err;
    }

    // Reject client tax tampering exceeding ±0.02 tolerance
    if (tax !== undefined && tax !== null && Math.abs(totalServerTax - parseFloat(tax)) > 0.02) {
      const err = new Error(`Tax mismatch. Expected ${totalServerTax.toFixed(2)}, received ${parseFloat(tax).toFixed(2)}.`);
      err.statusCode = 400;
      throw err;
    }

    if (paymentAmount !== undefined && parseFloat(paymentAmount) < serverTotal) {
      const err = new Error('Insufficient payment amount.');
      err.statusCode = 400;
      throw err;
    }

    const total = serverTotal;
    const change = paymentAmount ? parseFloat(paymentAmount) - total : 0;

    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const [lastSale] = await Sale.findAll({
      where: {
        invoiceNumber: { [Op.like]: `${dateStr}-%` },
        shopId
      },
      order: [['invoiceNumber', 'DESC']],
      limit: 1,
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    let sequence = '0001';
    if (lastSale) {
      const lastSequence = parseInt(lastSale.invoiceNumber.split('-')[1], 10);
      sequence = String(lastSequence + 1).padStart(4, '0');
    }
    const invoiceNumber = `${dateStr}-${sequence}`;

    const jwtId = user?.id;
    const resolvedUserId = (typeof jwtId === 'number')
      ? jwtId
      : (typeof jwtId === 'string' && /^\d+$/.test(jwtId))
        ? parseInt(jwtId, 10)
        : null;

    const sale = await Sale.create({
      invoiceNumber,
      idempotencyKey: idempotencyKey || null,
      subtotal: finalSaleSubtotal,
      tax: totalServerTax,
      taxRate: shopTaxRate,
      discount: totalDiscount,
      discountType: discountType || null,
      discountValue: discountValue ? parseFloat(discountValue) : null,
      total,
      paymentMethod,
      paymentAmount: paymentAmount ? parseFloat(paymentAmount) : null,
      change: change > 0 ? change : 0,
      paymentStatus: 'completed',
      customerName: customer?.name || WALK_IN_CUSTOMER_NAME,
      customerLocation: customer?.location || null,
      customerPhone: customer?.phone || null,
      customerEmail: customer?.email || null,
      customerId,
      userId: !user?.isEmployee ? resolvedUserId : null,
      employeeId: user?.isEmployee ? user.id : null,
      notes,
      shopId,
      paymentReference,
      paymentProvider,
      paymentNotes,
      metadata: {
        discountReason: discountReason || null,
        discountApprovedBy: cartDiscountNeedsApproval ? verifiedApproverName : null,
        managerApprovalId: verifiedApproverName ? managerApprovalId : null,
        requestHash,
        taxInclusive: isTaxInclusive,
        ...(saleData.metadata || {})
      }
    }, { transaction: t });

    await Promise.all(saleItems.map(item =>
      SaleItem.create({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        price: item.price,
        subtotal: item.subtotal,
        discount: item.discount,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        metadata: {
          discountReason: item.discountReason,
          discountApprovedBy: item.discountApprovedBy,
          taxCategory: item.taxCategory
        },
        saleId: sale.id,
        shopId
      }, { transaction: t })
    ));

    // Decrement stock on Inventory
    for (const { product, inventory, item } of lockedProducts) {
      const prevStock = parseFloat(inventory.stockQuantity || 0);
      const newStock = prevStock - item.quantity;
      await inventory.update({ stockQuantity: newStock }, { transaction: t });

      await StockMovement.create({
        shopId,
        organizationId: organizationId || product.organizationId,
        productId: product.id,
        quantity: -item.quantity,
        previousStock: prevStock,
        newStock: newStock,
        type: 'SALE',
        reference: invoiceNumber,
        userId: !user?.isEmployee ? resolvedUserId : null,
        employeeId: user?.isEmployee ? user.id : null
      }, { transaction: t });
    }

    const SalePayment = require('../models/SalePayment');
    await SalePayment.create({
      saleId:        sale.id,
      shopId:        shopId,
      paymentMethod: paymentMethod,
      amount:        total,
      gatewayRef:    saleData.gatewayRef || paymentReference || null,
      paidAt:        new Date(),
      processedBy:   user?.isEmployee ? user.id : null,
    }, { transaction: t });

    const resolvedCustomerId = customerId || customer?.id || null;
    let finalCustomerId = resolvedCustomerId;
    const isWalkIn = !resolvedCustomerId && (!customer?.name || customer.name === WALK_IN_CUSTOMER_NAME);

    if (!isWalkIn) {
      if (resolvedCustomerId) {
        const existingCustomer = await Customer.findOne({
          where: { id: resolvedCustomerId, organizationId },
          transaction: t
        });
        if (existingCustomer) {
          const loyaltyPoints = Math.floor(total);
          await existingCustomer.update({
            totalPurchases: parseFloat(existingCustomer.totalPurchases || 0) + total,
            loyaltyPoints: (existingCustomer.loyaltyPoints || 0) + loyaltyPoints,
            lastVisit: new Date(),
            ...(customer?.email && { email: customer.email }),
            ...(customer?.phone && { phone: customer.phone }),
            ...(customer?.location && { location: customer.location })
          }, { transaction: t });
        }
      } else if (customer && customer.name && customer.name !== WALK_IN_CUSTOMER_NAME) {
        let customerRecord = await Customer.findOne({
          where: {
            organizationId,
            [Op.or]: [
              ...(customer.email ? [{ email: customer.email }] : []),
              ...(customer.phone ? [{ phone: customer.phone }] : []),
              { name: customer.name }
            ]
          },
          transaction: t
        });

        if (!customerRecord) {
          customerRecord = await Customer.create({
            name: customer.name,
            email: customer.email || null,
            phone: customer.phone || null,
            location: customer.location || null,
            totalPurchases: total,
            lastVisit: new Date(),
            organizationId,
            shopId
          }, { transaction: t });
        } else {
          const loyaltyPoints = Math.floor(total);
          await customerRecord.update({
            totalPurchases: parseFloat(customerRecord.totalPurchases || 0) + total,
            loyaltyPoints: (customerRecord.loyaltyPoints || 0) + loyaltyPoints,
            lastVisit: new Date(),
            ...(customer.email && { email: customer.email }),
            ...(customer.phone && { phone: customer.phone }),
            ...(customer.location && { location: customer.location })
          }, { transaction: t });
        }

        finalCustomerId = customerRecord.id;
        await sale.update({ customerId: finalCustomerId }, { transaction: t });
      }
    }

    return { sale, invoiceNumber, total };
  };

  let saleResult = null;
  try {
    saleResult = existingTransaction
      ? await executeSaleCreation(existingTransaction)
      : await sequelize.transaction(executeSaleCreation);
  } catch (err) {
    // If unique constraint collision happened on (shopId, idempotencyKey) due to concurrent duplicate
    if (cleanIdempotencyKey && isIdempotencyUniqueError(err)) {
      const concurrentSale = await fetchCompleteSaleByIdempotencyKey(cleanIdempotencyKey, shopId);
      if (concurrentSale) {
        const existingHash = concurrentSale.metadata?.requestHash;
        if (existingHash && existingHash !== requestHash) {
          const conflictErr = new Error('The idempotency key was already used with a different request.');
          conflictErr.statusCode = 409;
          conflictErr.code = 'IDEMPOTENCY_KEY_REUSED';
          throw conflictErr;
        }
        return concurrentSale;
      }
    }
    throw err;
  }

  const { sale, invoiceNumber, total } = saleResult;

  // Invalidate analytics and dashboard cache so new sale reflects immediately
  invalidateAnalyticsCache(shopId);
  await invalidateShopProductCache(shopId);

  try {
    await logActivity({
      shopId: shopId,
      performedBy: user?.id,
      performedByType: user?.isEmployee ? 'employee' : 'user',
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: sale.id,
      details: `Created sale ${invoiceNumber} with total ${total}`
    });
  } catch (error) {
    console.warn('Failed to log sale activity:', error);
  }

  const completeSale = await Sale.findOne({
    where: { id: sale.id, shopId: shopId },
    attributes: {
      exclude: ['UserId', 'CustomerId']
    },
    include: [
      {
        model: SaleItem,
        include: [{
          model: Product,
          attributes: ['id', 'name', 'sku', 'price']
        }]
      },
      {
        model: Customer,
        attributes: ['id', 'name', 'email', 'phone', 'location', 'loyaltyPoints']
      },
      {
        model: Employee,
        attributes: ['id', 'firstName', 'lastName', 'email'],
        as: 'Employee'
      }
    ]
  });

  return completeSale;
};

// Update sale payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { paymentStatus } = req.body;
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.shopId || req.user.shopId }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    await sale.update({ paymentStatus });
    invalidateAnalyticsCache(sale.shopId || req.shopId || req.user.shopId);
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

// Get cashier-specific sales statistics
exports.getCashierStats = async (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;

    // Default start date to start of current week if not provided
    const now = new Date();
    const defaultWeekStart = new Date(now);
    defaultWeekStart.setDate(now.getDate() - now.getDay());
    defaultWeekStart.setHours(0, 0, 0, 0);

    const start = parseDate(startDate, defaultWeekStart);
    const end = parseDate(endDate, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)));

    // Build where clause
    const baseWhere = {
      shopId: req.user.shopId,
      createdAt: {
        [Op.between]: [start, end]
      }
    };

    // For cashiers and employees, include both userId and employeeId matching
    if (req.user.role === 'cashier' || req.user.role === 'employee') {
      baseWhere[Op.or] = [
        { userId: req.user.id },
        { employeeId: req.user.id }
      ];
    }
    else if (employeeId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);
      if (isUuid) {
        baseWhere.employeeId = employeeId;
      } else {
        baseWhere.userId = employeeId;
      }
    }

    const whereClause = withSaleFilter(baseWhere, REALIZED_SALE_FILTER);

    // Get sales data with SaleItems and processed SaleRefunds for net totals and items count
    const sales = await Sale.findAll({
      where: whereClause,
      attributes: [
        'id',
        'total',
        'createdAt',
        'employeeId',
        'userId'
      ],
      include: [
        {
          model: SaleItem,
          attributes: ['quantity'],
          required: false
        },
        {
          model: SaleRefund,
          as: 'refunds',
          where: { status: 'processed' },
          attributes: ['amount', 'quantity'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const getNetSaleTotal = (sale) => {
      const gross = parseFloat(sale.total || 0) || 0;
      const refunds = Array.isArray(sale.refunds) ? sale.refunds : [];
      const refundedAmt = refunds.reduce((s, r) => s + (parseFloat(r.amount || 0) || 0), 0);
      return Math.max(0, gross - refundedAmt);
    };

    const getNetSaleItemsCount = (sale) => {
      const items = Array.isArray(sale.SaleItems) ? sale.SaleItems : [];
      const soldQty = items.reduce((iSum, item) => iSum + (parseInt(item.quantity || 0, 10) || 0), 0);
      const refunds = Array.isArray(sale.refunds) ? sale.refunds : [];
      const refundedQty = refunds.reduce((rSum, r) => rSum + (parseInt(r.quantity || 0, 10) || 0), 0);
      return Math.max(0, soldQty - refundedQty);
    };

    const totalSales = sales.reduce((sum, sale) => sum + getNetSaleTotal(sale), 0);
    const orderCount = sales.length;

    // Today's stats
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    const todaySales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return saleDate >= todayStart && saleDate <= todayEnd;
    });

    const todayTotal = todaySales.reduce((sum, sale) => sum + getNetSaleTotal(sale), 0);
    const todayCount = todaySales.length;
    const todayItemCount = todaySales.reduce((sum, sale) => sum + getNetSaleItemsCount(sale), 0);

    // Week stats
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekSales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return saleDate >= weekStart && saleDate <= weekEnd;
    });

    const weekTotal = weekSales.reduce((sum, sale) => sum + getNetSaleTotal(sale), 0);
    const weekCount = weekSales.length;

    res.json({
      today: {
        totalSales: todayTotal,
        orderCount: todayCount,
        itemCount: todayItemCount
      },
      week: {
        totalSales: weekTotal,
        orderCount: weekCount
      },
      period: {
        totalSales,
        orderCount,
        startDate: start,
        endDate: end
      },
      sales: sales.slice(0, 10)
    });

  } catch (error) {
    console.error('Error fetching cashier stats:', error);

    // More descriptive error response
    let errorMessage = 'Failed to fetch cashier statistics';
    let statusCode = 500;

    if (error.name === 'SequelizeDatabaseError' && error.message.includes('invalid input syntax')) {
      errorMessage = 'Invalid employee ID format';
      statusCode = 400;
    } else if (error.name === 'SequelizeValidationError') {
      errorMessage = error.message;
      statusCode = 400;
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: error.message
    });
  }
};

// Get sales statistics
exports.getSalesStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const baseWhere = {
      shopId: req.user.shopId,
      createdAt: {
        [Op.between]: [
          parseDate(startDate, new Date(new Date().setHours(0, 0, 0, 0))),
          parseDate(endDate, new Date(new Date().setHours(23, 59, 59, 999)))
        ]
      }
    };
    const whereClause = withSaleFilter(baseWhere, REALIZED_SALE_FILTER);
    const netTotalExpr = `GREATEST(0, total - COALESCE((SELECT SUM(amount) FROM SaleRefunds WHERE SaleRefunds.saleId = Sale.id AND SaleRefunds.status = 'processed'), 0))`;

    const [totalSales, totalRevenueResult, averageTicket] = await Promise.all([
      Sale.count({ where: whereClause }),
      Sale.findOne({
        where: whereClause,
        attributes: [[sequelize.literal(`SUM(${netTotalExpr})`), 'totalRevenue']]
      }),
      Sale.findOne({
        where: whereClause,
        attributes: [[sequelize.literal(`AVG(${netTotalExpr})`), 'average']]
      })
    ]);

    const totalRevenue = totalRevenueResult ? Number(totalRevenueResult.getDataValue('totalRevenue') || 0) : 0;

    res.json({
      totalSales,
      totalRevenue,
      averageTicket: averageTicket ? Number(averageTicket.getDataValue('average') || 0) : 0
    });
  } catch (error) {
    console.error('Sales statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch sales statistics' });
  }
};

// Get all sales for admin with filtering by cashier and date range
exports.getAllSalesForAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { startDate, endDate, cashierId, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    // Build where clause
    const whereClause = {
      shopId: req.user.shopId
    };

    // Add date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          parseDate(startDate, new Date(new Date().setHours(0, 0, 0, 0))),
          parseDate(endDate, new Date(new Date().setHours(23, 59, 59, 999)))
        ]
      };
    }

    // Add cashier filter
    if (cashierId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cashierId);
      if (isUuid) {
        whereClause.employeeId = cashierId;
      } else {
        whereClause.userId = cashierId;
      }
    }

    const sales = await Sale.findAndCountAll({
      where: whereClause,
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false,
          as: 'SaleItems', // Explicitly set the alias
          include: [{
            model: Product,
            as: 'Product',
            attributes: ['id', 'name', 'sku', 'price'],
            required: false
          }]
        },
        {
          model: Customer,
          as: 'Customer',
          attributes: ['id', 'name', 'email', 'phone'],
          required: false
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          as: 'Employee',
          required: false
        },
        {
          model: User,
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
      distinct: true,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    // Log for debugging
    console.log('Fetched sales:', {
      total: sales.count,
      returned: sales.rows.length,
      sample: sales.rows.length > 0 ? {
        id: sales.rows[0].id,
        saleItemsCount: sales.rows[0].SaleItems?.length || 0,
        customer: sales.rows[0].Customer?.name || 'No customer',
        employee: sales.rows[0].Employee?.firstName || sales.rows[0].User?.name || 'No employee/user'
      } : null
    });

    const normalizedRows = sales.rows.map((row) => {
      const sale = row.get ? row.get({ plain: true }) : row;

      const saleItems = Array.isArray(sale.SaleItems) ? sale.SaleItems : [];
      const products = saleItems.map((si) => ({
        id: si.Product?.id ?? si.productId ?? null,
        name: si.Product?.name ?? 'Unknown',
        quantity: si.quantity ?? 0,
        priceAtSale: parseFloat(
          (si.price ?? si.unitPrice ?? si.originalPrice ?? 0)
        ),
        Product: si.Product
      }));

      const itemsText = saleItems.map(item =>
        `${item.quantity}x ${item.Product?.name || 'Unknown Product'}`
      ).join(', ');

      const employeeName = sale.Employee
        ? `${sale.Employee.firstName || ''} ${sale.Employee.lastName || ''}`.trim()
        : (sale.User?.name || null);

      return {
        ...sale,
        products,
        SaleItems: saleItems,
        items: saleItems.length > 0 ? itemsText : '0 items',
        itemCount: `${saleItems.length} items`,
        employee: employeeName,
        cashierName: employeeName || 'Walk-in Cashier',
        customer: sale.Customer ? {
          id: sale.Customer.id,
          name: sale.Customer.name,
          email: sale.Customer.email,
          phone: sale.Customer.phone
        } : null,
        Customer: sale.Customer,
        subtotal: parseFloat(sale.subtotal ?? (products.reduce((acc, p) => acc + (p.priceAtSale * p.quantity), 0))),
        discount: parseFloat(sale.discount ?? 0),
        discountType: sale.discountType || null,
        discountValue: sale.discountValue ? parseFloat(sale.discountValue) : null,
        tax: parseFloat(sale.tax ?? 0),
        taxRate: parseFloat(sale.taxRate ?? 0),
        totalAmount: parseFloat(sale.total ?? 0),
        total: parseFloat(sale.total ?? 0),
        paymentAmount: sale.paymentAmount ? parseFloat(sale.paymentAmount) : null,
        change: sale.change ? parseFloat(sale.change) : null,
        paymentMethod: (sale.paymentMethod || 'cash').toUpperCase(),
        status: (sale.saleStatus || 'completed').toUpperCase(),
        saleStatus: sale.saleStatus || 'completed',
        metadata: sale.metadata || {}
      };
    });

    res.json({
      sales: normalizedRows,
      total: sales.count,
      totalPages: Math.ceil(sales.count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching admin sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

// Get cashier's own sales only
exports.getMySales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { startDate, endDate, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    // Build where clause - only show sales made by this cashier
    // Use OR to check both userId and employeeId to handle legacy sales
    const whereClause = {
      shopId: req.user.shopId,
      [Op.or]: [
        { userId: req.user.id },
        { employeeId: req.user.id }
      ]
    };

    // Add date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          parseDate(startDate, new Date(new Date().setHours(0, 0, 0, 0))),
          parseDate(endDate, new Date(new Date().setHours(23, 59, 59, 999)))
        ]
      };
    }

    const sales = await Sale.findAndCountAll({
      where: whereClause,
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false,
          include: [{
            model: Product,
            attributes: ['id', 'name', 'sku'],
            required: false
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone'],
          required: false
        }
      ],
      distinct: true,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    // Normalize response to match frontend expectations
    const normalizedRows = sales.rows.map((row) => {
      const sale = row.get ? row.get({ plain: true }) : row;

      const saleItems = Array.isArray(sale.SaleItems) ? sale.SaleItems : [];
      const products = saleItems.map((si) => ({
        id: si.Product?.id ?? si.ProductId ?? null,
        name: si.Product?.name ?? 'Unknown',
        quantity: si.quantity ?? 0,
        priceAtSale: parseFloat(
          (si.price ?? si.unitPrice ?? si.originalPrice ?? 0)
        )
      }));

      const itemsText = saleItems.map(item =>
        `${item.quantity}x ${item.Product?.name || 'Unknown Product'}`
      ).join(', ');

      return {
        id: sale.id,
        createdAt: sale.createdAt,
        invoiceNumber: sale.invoiceNumber,
        customer: sale.Customer ? {
          id: sale.Customer.id,
          name: sale.Customer.name,
          email: sale.Customer.email,
          phone: sale.Customer.phone
        } : null,
        Customer: sale.Customer,
        products,
        SaleItems: saleItems,
        items: saleItems.length > 0 ? itemsText : '0 items',
        itemCount: `${saleItems.length} items`,
        subtotal: parseFloat(sale.subtotal ?? (products.reduce((acc, p) => acc + (p.priceAtSale * p.quantity), 0))),
        discount: parseFloat(sale.discount ?? 0),
        discountType: sale.discountType || null,
        discountValue: sale.discountValue ? parseFloat(sale.discountValue) : null,
        tax: parseFloat(sale.tax ?? 0),
        taxRate: parseFloat(sale.taxRate ?? 0),
        totalAmount: parseFloat(sale.total ?? 0),
        total: parseFloat(sale.total ?? 0),
        paymentAmount: sale.paymentAmount ? parseFloat(sale.paymentAmount) : null,
        change: sale.change ? parseFloat(sale.change) : null,
        paymentMethod: (sale.paymentMethod || 'cash').toUpperCase(),
        status: (sale.saleStatus || 'completed').toUpperCase(),
        saleStatus: sale.saleStatus || 'completed',
        metadata: sale.metadata || {}
      };
    });

    res.json({
      sales: normalizedRows,
      total: sales.count,
      totalPages: Math.ceil(sales.count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching my sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

exports.processRefund = async (req, res) => {
  const { saleId } = req.params;
  const { items, managerApprovalId, managerPassword, adminOverride } = req.body || {};
  const refundedBy = String(req.user.id);
  const shopId = req.shopId || req.user.shopId;
  let organizationId = req.organizationId || req.user?.organizationId;
  if (!organizationId && shopId) {
    const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
    organizationId = shop?.organizationId;
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Refund items are required' });
  }

  // Filter out items with quantity <= 0
  const itemsToRefund = items.filter(item => item && Number(item.quantity) > 0);
  if (itemsToRefund.length === 0) {
    return res.status(400).json({ error: 'No items with quantity > 0 specified for refund' });
  }

  // Server-side enforcement: Only admin/manager can pass adminOverride
  if (adminOverride && !['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin or Manager role is strictly required to execute policy overrides.' });
  }

  const rawIdempotencyKey =
    req.headers?.['idempotency-key'] ||
    req.headers?.['x-idempotency-key'] ||
    (typeof req.header === 'function' ? (req.header('Idempotency-Key') || req.header('idempotency-key')) : null) ||
    req.body?.idempotencyKey;
  let cleanIdempotencyKey;
  try {
    cleanIdempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  // H-03: Warn when the caller omits the idempotency key.
  // Without a key, concurrent or duplicate refund requests cannot be deduplicated.
  // Each distinct refund action MUST supply a unique key; retries MUST reuse the same key.
  // See generateRefundFingerprint in idempotencyUtils.js for the full contract.
  if (!cleanIdempotencyKey) {
    logger.warn(
      `[processRefund] No idempotency key supplied for saleId=${saleId} shopId=${shopId} userId=${refundedBy}. ` +
      'Deduplication is disabled for this request. Callers should supply a unique Idempotency-Key header per refund action.'
    );
  }
  const refundFingerprint = cleanIdempotencyKey
    ? generateRefundFingerprint(saleId, shopId, itemsToRefund)
    : null;

  try {
    // Fetch system settings for return policy & approval thresholds
    const systemSettings = await SystemSettings.findOne({ where: { shopId } });
    const returnWindowDays = systemSettings?.returnWindowDays !== undefined ? systemSettings.returnWindowDays : 30;
    const maxUnapproved = parseFloat(systemSettings?.maxUnapprovedRefundAmount !== undefined ? systemSettings.maxUnapprovedRefundAmount : 5000);

    const t = await sequelize.transaction();

    try {
      // 1. Lock the parent Sale row first (serializes concurrent refunds and cancellations on this sale)
      const sale = await Sale.findOne({
        where: { id: saleId, shopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!sale) {
        await t.rollback();
        return res.status(404).json({ error: 'Sale not found' });
      }

      // 2. Idempotency check under the Sale row lock
      if (cleanIdempotencyKey) {
        // Primary check: dedicated database-level RefundIdempotency table
        const existingTableRecord = await RefundIdempotency.findOne({
          where: { shopId, idempotencyKey: cleanIdempotencyKey },
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (existingTableRecord) {
          // Cross-sale protection: prevent replaying or exposing a different sale's refund
          if (Number(existingTableRecord.saleId) !== Number(sale.id)) {
            await t.rollback();
            return res.status(409).json({
              error: 'Idempotency key has already been used for a different sale',
              code: 'IDEMPOTENCY_KEY_REUSED'
            });
          }

          if (existingTableRecord.requestFingerprint && existingTableRecord.requestFingerprint !== refundFingerprint) {
            await t.rollback();
            return res.status(409).json({
              error: 'Idempotency key has already been used with a different refund payload',
              code: 'IDEMPOTENCY_KEY_REUSED'
            });
          }

          let duplicateRefunds = [];
          if (Array.isArray(existingTableRecord.refundIds) && existingTableRecord.refundIds.length > 0) {
            duplicateRefunds = await SaleRefund.findAll({
              where: { id: existingTableRecord.refundIds, saleId: sale.id, shopId },
              transaction: t
            });
          }

          const cachedPayload = existingTableRecord.responsePayload || {};

          await t.commit();
          return res.status(200).json({
            refunds: duplicateRefunds.length > 0 ? duplicateRefunds : (cachedPayload.refunds || []),
            saleStatus: existingTableRecord.saleStatus || sale.saleStatus,
            totalRefundAmount: parseFloat(existingTableRecord.totalRefundAmount || cachedPayload.totalRefundAmount || 0),
            totalTaxRefunded: parseFloat(existingTableRecord.totalTaxRefunded || cachedPayload.totalTaxRefunded || 0),
            taxRefunded: parseFloat(existingTableRecord.totalTaxRefunded || cachedPayload.totalTaxRefunded || 0),
            isDuplicate: true
          });
        }

        // Secondary fallback for legacy refunds stored in Sale.metadata
        const existingIdempotencyMap = sale.metadata?.refundIdempotency || {};
        if (existingIdempotencyMap[cleanIdempotencyKey]) {
          const entry = existingIdempotencyMap[cleanIdempotencyKey];
          if (entry.fingerprint && entry.fingerprint !== refundFingerprint) {
            await t.rollback();
            return res.status(409).json({
              error: 'Idempotency key has already been used with a different refund payload',
              code: 'IDEMPOTENCY_KEY_REUSED'
            });
          }

          const duplicateRefunds = Array.isArray(entry.refundIds) && entry.refundIds.length > 0
            ? await SaleRefund.findAll({
                where: { id: entry.refundIds, saleId: sale.id, shopId },
                transaction: t
              })
            : [];

          await t.commit();
          return res.status(200).json({
            refunds: duplicateRefunds,
            saleStatus: entry.saleStatus || sale.saleStatus,
            totalRefundAmount: entry.totalRefundAmount,
            totalTaxRefunded: entry.totalTaxRefunded,
            taxRefunded: entry.totalTaxRefunded,
            isDuplicate: true
          });
        }
      }

      // 3. Validate sale lifecycle state inside the transaction
      if (
        sale.saleStatus === 'cancelled' ||
        sale.status === 'cancelled' ||
        sale.metadata?.isDeleted === true
      ) {
        await t.rollback();
        return res.status(400).json({ error: 'Cannot process refund for a cancelled or deleted sale' });
      }

      if (
        ['pending', 'confirmed', 'processing'].includes(sale.saleStatus) ||
        sale.status === 'pending' ||
        sale.fulfillmentStatus === 'failed'
      ) {
        await t.rollback();
        return res.status(400).json({ error: 'Cannot process refund for an uncompleted or failed sale' });
      }

      // Return Window Eligibility Check
      const daysSinceSale = (new Date() - new Date(sale.createdAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceSale > returnWindowDays && !adminOverride && req.user.role !== 'admin') {
        await t.rollback();
        return res.status(400).json({
          error: `Return window expired. Sales older than ${returnWindowDays} days require administrator override.`
        });
      }

      // 4. Current-read SaleItems and processed SaleRefunds inside transaction t
      const saleItems = await SaleItem.findAll({
        where: { saleId: sale.id },
        lock: t.LOCK.SHARE,
        transaction: t
      });

      // Aggregate duplicate SaleItem lines for the same productId within a sale
      const saleItemsMap = new Map();
      for (const si of saleItems) {
        const pid = si.productId;
        const lineQty = Number(si.quantity || 0);
        const unitPrice = parseFloat(si.unitPrice || si.price || si.originalPrice || 0);
        const grossLine = lineQty * unitPrice;
        const recordedSub = parseFloat(si.subtotal !== undefined && si.subtotal !== null ? si.subtotal : grossLine);
        const lineDisc = parseFloat(si.discount || 0);
        const lineTaxAmt = parseFloat(si.taxAmount || 0);
        const lineTaxRt = parseFloat(si.taxRate || 0);

        if (!saleItemsMap.has(pid)) {
          saleItemsMap.set(pid, {
            productId: pid,
            quantity: lineQty,
            unitPrice,
            price: parseFloat(si.price || unitPrice || 0),
            originalPrice: parseFloat(si.originalPrice || unitPrice || 0),
            subtotal: recordedSub,
            discount: lineDisc,
            taxAmount: lineTaxAmt,
            taxRate: lineTaxRt,
            metadata: si.metadata || {}
          });
        } else {
          const existing = saleItemsMap.get(pid);
          const prevQty = existing.quantity;
          const newQty = prevQty + lineQty;
          existing.quantity = newQty;
          existing.subtotal = existing.subtotal + recordedSub;
          existing.discount = existing.discount + lineDisc;
          existing.taxAmount = existing.taxAmount + lineTaxAmt;
          existing.unitPrice = newQty > 0 ? ((existing.unitPrice * prevQty) + grossLine) / newQty : unitPrice;
          existing.price = existing.unitPrice;
        }
      }

      // Find all previous refunds for this sale using locking current read
      const previousRefunds = await SaleRefund.findAll({
        where: { saleId: sale.id, status: 'processed' },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      // Map of productId -> sum of previously refunded quantity
      const previouslyRefundedMap = new Map();
      previousRefunds.forEach(pr => {
        const qty = previouslyRefundedMap.get(pr.productId) || 0;
        previouslyRefundedMap.set(pr.productId, qty + (pr.quantity || 0));
      });

      // Validate each item, non-returnable status, and available quantity inside transaction t
      const requestedQtyByProduct = new Map();
      const productRecordsMap = new Map();
      for (const item of itemsToRefund) {
        const saleItem = saleItemsMap.get(item.productId);
        if (!saleItem) {
          await t.rollback();
          return res.status(400).json({ error: `Product ${item.productId} was not part of this sale` });
        }

        const prevQty = previouslyRefundedMap.get(item.productId) || 0;
        const alreadyRequestedQty = requestedQtyByProduct.get(item.productId) || 0;
        const availableQty = saleItem.quantity - prevQty - alreadyRequestedQty;

        if (item.quantity > availableQty) {
          await t.rollback();
          return res.status(400).json({
            error: `Cannot refund ${item.quantity} units of product ${item.productId}. Only ${Math.max(0, availableQty)} units available for refund.`
          });
        }
        requestedQtyByProduct.set(item.productId, alreadyRequestedQty + item.quantity);

        const productWhere = organizationId
          ? { id: item.productId, [Op.or]: [{ shopId }, { organizationId }] }
          : { id: item.productId, shopId };
        const productRecord = await Product.findOne({ where: productWhere, transaction: t });
        if (productRecord) {
          productRecordsMap.set(item.productId, productRecord);
        }
        const canBypassNonReturnable = adminOverride && ['admin', 'manager'].includes(req.user.role);
        if (productRecord && productRecord.nonReturnable && !canBypassNonReturnable && req.user.role !== 'admin') {
          await t.rollback();
          return res.status(400).json({ error: `Product "${productRecord.name}" is marked as non-returnable.` });
        }
      }

      // Retrieve whether sale was tax-inclusive
      const isTaxInclusive = Boolean(sale.metadata?.taxInclusive);

      // Calculate total net refund amount across all requested items (net price accounting for discounts and tax)
      let calculatedTotalRefund = 0;
      const runningRefundedByProduct = new Map(previouslyRefundedMap);
      const runningRefundedTaxByProduct = new Map();
      previousRefunds.forEach(r => {
        const prevTax = runningRefundedTaxByProduct.get(r.productId) || 0;
        runningRefundedTaxByProduct.set(r.productId, prevTax + parseFloat(r.metadata?.taxAmount || 0));
      });

      const itemsWithNetPrice = itemsToRefund.map(item => {
        const saleItem = saleItemsMap.get(item.productId);
        const lineQuantity = saleItem.quantity || 1;
        const unitPrice = parseFloat(saleItem.unitPrice || saleItem.price || saleItem.originalPrice || 0);
        const grossLineAmount = lineQuantity * unitPrice;
        const recordedSubtotal = parseFloat(saleItem.subtotal !== undefined && saleItem.subtotal !== null ? saleItem.subtotal : grossLineAmount);
        const lineDiscount = parseFloat(saleItem.discount || 0);

        // If recordedSubtotal is already net of discount, avoid double-subtracting
        let netLineAmount;
        if (recordedSubtotal <= grossLineAmount - lineDiscount && grossLineAmount > 0 && lineDiscount > 0) {
          netLineAmount = recordedSubtotal;
        } else {
          netLineAmount = Math.max(0, recordedSubtotal - lineDiscount);
        }

        const netUnitPrice = lineQuantity > 0 ? netLineAmount / lineQuantity : 0;
        const lineNetRefund = round2(item.quantity * netUnitPrice);

        // Proportional tax allocation
        const lineTaxAmount = parseFloat(saleItem.taxAmount || 0);
        const lineTaxRate = parseFloat(saleItem.taxRate || 0);
        const effectiveTaxCategory = saleItem.metadata?.taxCategory || (lineTaxRate > 0 ? 'standard' : 'exempt');

        const prevQty = runningRefundedByProduct.get(item.productId) || 0;
        const isFinalItemRefund = (prevQty + item.quantity) >= lineQuantity;

        let lineRefundTax = 0;
        if (lineTaxAmount > 0) {
          if (isFinalItemRefund) {
            const prevRefundedTaxOnItem = runningRefundedTaxByProduct.get(item.productId) || 0;
            lineRefundTax = Math.max(0, round2(lineTaxAmount - prevRefundedTaxOnItem));
          } else {
            lineRefundTax = round2(lineTaxAmount * (item.quantity / lineQuantity));
          }
        }

        runningRefundedByProduct.set(item.productId, prevQty + item.quantity);
        runningRefundedTaxByProduct.set(
          item.productId,
          (runningRefundedTaxByProduct.get(item.productId) || 0) + lineRefundTax
        );

        // Total refund for line: in inclusive mode, shelf price includes tax; in exclusive mode, tax is refunded on top
        let lineRefundAmount;
        let linePreTaxNetRefund;
        if (isTaxInclusive) {
          lineRefundAmount = lineNetRefund;
          linePreTaxNetRefund = round2(Math.max(0, lineRefundAmount - lineRefundTax));
        } else {
          lineRefundAmount = round2(lineNetRefund + lineRefundTax);
          linePreTaxNetRefund = lineNetRefund;
        }

        calculatedTotalRefund += lineRefundAmount;

        return {
          ...item,
          netUnitPrice,
          lineNetRefund,
          linePreTaxNetRefund,
          lineRefundTax,
          lineTaxRate,
          effectiveTaxCategory,
          lineRefundAmount
        };
      });

      const totalRefundAmount = round2(calculatedTotalRefund);
      const totalRefundTax = round2(itemsWithNetPrice.reduce((sum, it) => sum + it.lineRefundTax, 0));

      // Approval Threshold & Credential Check
      let verifiedManagerId = null;

      if (totalRefundAmount > maxUnapproved && req.user.role !== 'admin') {
        if (!managerApprovalId) {
          await t.rollback();
          return res.status(403).json({
            error: `Refund total (${totalRefundAmount} KSh) exceeds unapproved threshold (${maxUnapproved} KSh). Manager approval & password credentials are required.`
          });
        }

        if (!managerPassword || typeof managerPassword !== 'string' || managerPassword.trim() === '') {
          await t.rollback();
          return res.status(401).json({ error: 'Manager password credential is strictly required for threshold approval.' });
        }

        if (!isIntegerId(managerApprovalId)) {
          await t.rollback();
          return res.status(403).json({ error: 'Selected approving user is not an active Manager or Admin.' });
        }

        const approvingManager = await User.findOne({
          where: { id: parseInt(managerApprovalId, 10), shopId, active: true },
          transaction: t
        });

        if (!approvingManager || !['manager', 'admin'].includes(approvingManager.role)) {
          await t.rollback();
          return res.status(403).json({ error: 'Selected approving user is not an active Manager or Admin.' });
        }

        const isValidPassword = await approvingManager.validatePassword(managerPassword);
        if (!isValidPassword) {
          await t.rollback();
          return res.status(401).json({ error: `Invalid password for approving manager ${approvingManager.name || approvingManager.email}.` });
        }

        verifiedManagerId = String(approvingManager.id);
      } else if (managerApprovalId) {
        if (req.user.role !== 'admin') {
          if (!managerPassword || typeof managerPassword !== 'string' || managerPassword.trim() === '') {
            await t.rollback();
            return res.status(401).json({ error: 'Manager password credential is strictly required when submitting manager approval.' });
          }

          if (!isIntegerId(managerApprovalId)) {
            await t.rollback();
            return res.status(403).json({ error: 'Selected approving user is not an active Manager or Admin.' });
          }

          const approvingManager = await User.findOne({
            where: { id: parseInt(managerApprovalId, 10), shopId, active: true },
            transaction: t
          });

          if (!approvingManager || !['manager', 'admin'].includes(approvingManager.role)) {
            await t.rollback();
            return res.status(403).json({ error: 'Selected approving user is not an active Manager or Admin.' });
          }

          const isValidPassword = await approvingManager.validatePassword(managerPassword);
          if (!isValidPassword) {
            await t.rollback();
            return res.status(401).json({ error: `Invalid password for approving manager ${approvingManager.name || approvingManager.email}.` });
          }
        }

        verifiedManagerId = String(managerApprovalId);
      }

      // Determine refund method
      const refundMethod = (sale.paymentMethod === 'mobile' || sale.paymentMethod === 'mobile_money')
        ? 'mobile_money'
        : (['cash', 'card', 'store_credit'].includes(sale.paymentMethod) ? sale.paymentMethod : 'cash');

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refundedBy);
      const processedBy = isUuid ? refundedBy : null;

      // Pre-lock Inventory rows in deterministic ascending productId order for restock items
      const restockProductIds = [...new Set(
        itemsWithNetPrice
          .filter(it => {
            const disp = ['restock', 'damaged_writeoff', 'return_to_supplier'].includes(it.disposition)
              ? it.disposition
              : 'restock';
            return disp === 'restock';
          })
          .map(it => it.productId)
      )].sort((a, b) => Number(a) - Number(b));

      const lockedInventoryMap = new Map();
      for (const pid of restockProductIds) {
        const inv = await Inventory.findOne({
          where: { productId: pid, shopId },
          lock: t.LOCK.UPDATE,
          transaction: t
        });
        if (inv) {
          lockedInventoryMap.set(pid, inv);
        }
      }

      const createdRefunds = [];

      for (const item of itemsWithNetPrice) {
        const disposition = ['restock', 'damaged_writeoff', 'return_to_supplier'].includes(item.disposition)
          ? item.disposition
          : 'restock';

        const validReasonCodes = ['DEFECTIVE', 'WRONG_ITEM', 'EXPIRED', 'CHANGED_MIND', 'OTHER'];
        const reasonCode = validReasonCodes.includes(item.reasonCode)
          ? item.reasonCode
          : (validReasonCodes.includes(item.reason) ? item.reason : 'OTHER');

        const reasonNotes = item.reasonNotes || item.reason || 'Customer Return';

        // a. Insert row into SaleRefunds
        const refundRow = await SaleRefund.create({
          saleId: parseInt(saleId, 10),
          productId: item.productId,
          quantity: item.quantity,
          amount: item.lineRefundAmount,
          refundAmount: item.lineRefundAmount,
          reason: reasonNotes,
          reasonCode,
          reasonNotes,
          disposition,
          managerApprovalId: verifiedManagerId || managerApprovalId || null,
          refundMethod,
          processedBy,
          refundedBy,
          status: 'processed',
          shopId,
          refundedAt: new Date(),
          metadata: {
            disposition,
            isWriteOff: disposition === 'damaged_writeoff',
            taxAmount: item.lineRefundTax,
            taxRate: item.lineTaxRate,
            taxCategory: item.effectiveTaxCategory,
            netAmount: item.linePreTaxNetRefund,
            ...(cleanIdempotencyKey ? { idempotencyKey: cleanIdempotencyKey } : {})
          }
        }, { transaction: t });

        createdRefunds.push(refundRow);

        // b. Update inventory ONLY if disposition is 'restock'
        if (disposition === 'restock') {
          let inventory = lockedInventoryMap.get(item.productId) || await Inventory.findOne({
            where: { productId: item.productId, shopId },
            lock: t.LOCK.UPDATE,
            transaction: t
          });

          let product = productRecordsMap.get(item.productId);
          if (!product) {
            const productWhere = organizationId
              ? { id: item.productId, [Op.or]: [{ shopId }, { organizationId }] }
              : { id: item.productId, shopId };
            product = await Product.findOne({
              where: productWhere,
              transaction: t
            });
          }

          if (!inventory && product) {
            logger.warn(`[processRefund] No inventory row found for productId ${product.id} and shopId ${shopId}. Creating explicit default.`);
            inventory = await Inventory.create({
              productId: product.id,
              shopId,
              stockQuantity: 0,
              reorderPoint: 10
            }, { transaction: t });
            lockedInventoryMap.set(item.productId, inventory);
          }

          if (inventory) {
            const prevStock = parseFloat(inventory.stockQuantity || 0);
            const newStock = prevStock + item.quantity;
            await inventory.update({ stockQuantity: newStock }, { transaction: t });
            await StockMovement.create({
              shopId,
              organizationId: organizationId || product?.organizationId,
              productId: item.productId,
              quantity: item.quantity,
              previousStock: prevStock,
              newStock: newStock,
              type: 'SALE_REFUND',
              reference: `REFUND-${sale.invoiceNumber || sale.id}`,
              userId: (!req.user?.isEmployee && typeof req.user?.id === 'number') ? req.user.id : null,
              employeeId: req.user?.isEmployee ? req.user.id : null
            }, { transaction: t });
          }
        } else if (disposition === 'damaged_writeoff') {
          // Log damaged write-off loss in ActivityLogs
          await logActivity({
            shopId,
            performedBy: req.user.id,
            performedByType: req.user.isEmployee ? 'employee' : 'user',
            action: 'inventory_writeoff',
            entity: 'product',
            entityId: item.productId,
            details: `Wrote off ${item.quantity} units of product ${item.productId} as damaged/defective from refund #${refundRow.id}`
          }, t);
        }
      }

      // c. Negative payment ledger entry in SalePayment to record cash/method reversal
      await SalePayment.create({
        saleId: parseInt(saleId, 10),
        amount: -totalRefundAmount,
        paymentMethod: refundMethod,
        paymentReference: `REFUND-${saleId}-${Date.now()}`,
        paymentProvider: 'System Refund Reversal',
        status: 'completed',
        processedBy,
        shopId,
        paidAt: new Date(),
        metadata: {
          isRefundReversal: true,
          refundedBy,
          managerApprovalId: managerApprovalId || null
        }
      }, { transaction: t });

      // d. Determine if all items in the sale are fully refunded
      const updatedRefundedMap = new Map(previouslyRefundedMap);
      itemsToRefund.forEach(item => {
        const qty = updatedRefundedMap.get(item.productId) || 0;
        updatedRefundedMap.set(item.productId, qty + item.quantity);
      });

      let allFullyRefunded = true;
      for (const saleItem of saleItemsMap.values()) {
        const totalRefunded = updatedRefundedMap.get(saleItem.productId) || 0;
        if (totalRefunded < saleItem.quantity) {
          allFullyRefunded = false;
          break;
        }
      }

      const saleStatus = allFullyRefunded ? 'refunded' : 'partial_refund';

      // Update Sales.saleStatus, cumulative metadata.refundedTax, and refundIdempotency
      const previousRefundedTax = parseFloat(sale.metadata?.refundedTax || 0);
      const newTotalRefundedTax = round2(previousRefundedTax + totalRefundTax);
      const updatedMetadata = {
        ...(sale.metadata || {}),
        refundedTax: newTotalRefundedTax
      };
      if (cleanIdempotencyKey) {
        updatedMetadata.refundIdempotency = {
          ...(sale.metadata?.refundIdempotency || {}),
          [cleanIdempotencyKey]: {
            fingerprint: refundFingerprint,
            refundIds: createdRefunds.map(r => r.id),
            saleStatus,
            totalRefundAmount,
            totalTaxRefunded: totalRefundTax,
            processedAt: new Date().toISOString()
          }
        };
      }

      await sale.update({
        saleStatus,
        metadata: updatedMetadata
      }, { transaction: t });

      // e. Decrement customer totalPurchases and loyaltyPoints if sale was for a registered customer
      if (sale.customerId) {
        const pointsToDeduct = Math.floor(totalRefundAmount);
        const customerWhere = organizationId
          ? { id: sale.customerId, [Op.or]: [{ organizationId }, { shopId }] }
          : { id: sale.customerId };
        const customerRecord = await Customer.findOne({
          where: customerWhere,
          lock: t.LOCK.UPDATE,
          transaction: t
        });
        if (customerRecord) {
          const newTotalPurchases = Math.max(0, parseFloat(customerRecord.totalPurchases || 0) - totalRefundAmount);
          const newLoyaltyPoints = Math.max(0, (customerRecord.loyaltyPoints || 0) - pointsToDeduct);
          await customerRecord.update({
            totalPurchases: newTotalPurchases,
            loyaltyPoints: newLoyaltyPoints
          }, { transaction: t });
        }
      }

      // f. Log activity
      await logActivity({
        shopId,
        performedBy: req.user.id,
        performedByType: req.user.isEmployee ? 'employee' : 'user',
        action: 'refund',
        entity: 'sale',
        entityId: parseInt(saleId, 10),
        details: `Processed ${allFullyRefunded ? 'full' : 'partial'} refund for sale ${sale.invoiceNumber} (Total: ${totalRefundAmount} KSh)`
      }, t);

      const responsePayload = {
        refunds: createdRefunds,
        saleStatus,
        totalRefundAmount,
        totalTaxRefunded: totalRefundTax,
        taxRefunded: totalRefundTax
      };

      if (cleanIdempotencyKey) {
        await RefundIdempotency.create({
          shopId,
          saleId: parseInt(saleId, 10),
          idempotencyKey: cleanIdempotencyKey,
          requestFingerprint: refundFingerprint,
          refundIds: createdRefunds.map(r => r.id),
          responsePayload,
          saleStatus,
          totalRefundAmount,
          totalTaxRefunded: totalRefundTax
        }, { transaction: t });
      }

      await t.commit();
      invalidateAnalyticsCache(shopId);
      await invalidateShopProductCache(shopId);
      await invalidateShopInsightsCache(organizationId || req.user?.organizationId, shopId);

      res.json(responsePayload);
    } catch (error) {
      if (!t.finished) {
        await t.rollback();
      }

      // Handle race condition: concurrent request with the same idempotencyKey
      if (cleanIdempotencyKey && isRefundIdempotencyUniqueError(error)) {
        try {
          const winningRecord = await RefundIdempotency.findOne({
            where: { shopId, idempotencyKey: cleanIdempotencyKey }
          });

          if (winningRecord) {
            if (Number(winningRecord.saleId) !== parseInt(saleId, 10)) {
              return res.status(409).json({
                error: 'Idempotency key has already been used for a different sale',
                code: 'IDEMPOTENCY_KEY_REUSED'
              });
            }

            if (winningRecord.requestFingerprint && winningRecord.requestFingerprint !== refundFingerprint) {
              return res.status(409).json({
                error: 'Idempotency key has already been used with a different refund payload',
                code: 'IDEMPOTENCY_KEY_REUSED'
              });
            }

            let duplicateRefunds = [];
            if (Array.isArray(winningRecord.refundIds) && winningRecord.refundIds.length > 0) {
              duplicateRefunds = await SaleRefund.findAll({
                where: { id: winningRecord.refundIds, saleId: parseInt(saleId, 10), shopId }
              });
            }

            const cachedPayload = winningRecord.responsePayload || {};

            return res.status(200).json({
              refunds: duplicateRefunds.length > 0 ? duplicateRefunds : (cachedPayload.refunds || []),
              saleStatus: winningRecord.saleStatus || cachedPayload.saleStatus || 'refunded',
              totalRefundAmount: parseFloat(winningRecord.totalRefundAmount || cachedPayload.totalRefundAmount || 0),
              totalTaxRefunded: parseFloat(winningRecord.totalTaxRefunded || cachedPayload.totalTaxRefunded || 0),
              taxRefunded: parseFloat(winningRecord.totalTaxRefunded || cachedPayload.totalTaxRefunded || 0),
              isDuplicate: true
            });
          }
        } catch (recoveryErr) {
          console.error('Error recovering winning refund idempotency:', recoveryErr);
        }
      }

      throw error;
    }
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to process refund' });
  }
};

exports.getSaleRefunds = async (req, res) => {
  const { saleId } = req.params;
  const shopId = req.shopId || req.user.shopId;

  try {
    const refunds = await SaleRefund.findAll({
      where: { saleId, shopId },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // We also need the refunding employee's or user's name.
    const userIds = [];
    const employeeIds = [];

    refunds.forEach(r => {
      const refBy = r.refundedBy;
      if (refBy) {
        if (/^[0-9]+$/.test(refBy)) {
          userIds.push(parseInt(refBy, 10));
        } else {
          employeeIds.push(refBy);
        }
      }
    });

    const [users, employees] = await Promise.all([
      User.findAll({
        where: { id: userIds, shopId },
        attributes: ['id', 'name']
      }),
      Employee.findAll({
        where: { id: employeeIds, shopId },
        attributes: ['id', 'firstName', 'lastName']
      })
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u.name]));
    const employeeMap = new Map(employees.map(e => [String(e.id), `${e.firstName} ${e.lastName}`.trim()]));

    const formattedRefunds = refunds.map(r => {
      let performerName = 'Unknown';
      const refBy = r.refundedBy;
      if (refBy) {
        if (userMap.has(refBy)) {
          performerName = userMap.get(refBy);
        } else if (employeeMap.has(refBy)) {
          performerName = employeeMap.get(refBy);
        }
      }

      return {
        id: r.id,
        saleId: r.saleId,
        productId: r.productId,
        quantity: r.quantity,
        amount: parseFloat(r.amount || 0),
        refundAmount: parseFloat(r.refundAmount || 0),
        reason: r.reason,
        refundMethod: r.refundMethod,
        refundedBy: r.refundedBy,
        refunderName: performerName,
        refundedAt: r.refundedAt || r.createdAt,
        product: r.product
      };
    });

    res.json(formattedRefunds);
  } catch (error) {
    console.error('Error fetching sale refunds:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
};

exports.getAllReturns = async (req, res) => {
  const shopId = req.shopId || req.user.shopId;

  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { count, rows: refunds } = await SaleRefund.findAndCountAll({
      where: { shopId },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'price']
        },
        {
          model: Sale,
          as: 'sale',
          attributes: ['id', 'invoiceNumber', 'customerName', 'total', 'paymentMethod', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const userIds = [];
    const employeeIds = [];

    refunds.forEach(r => {
      const refBy = r.refundedBy;
      if (refBy) {
        if (/^[0-9]+$/.test(refBy)) {
          userIds.push(parseInt(refBy, 10));
        } else {
          employeeIds.push(refBy);
        }
      }
    });

    const [users, employees] = await Promise.all([
      User.findAll({
        where: { id: userIds, shopId },
        attributes: ['id', 'name']
      }),
      Employee.findAll({
        where: { id: employeeIds, shopId },
        attributes: ['id', 'firstName', 'lastName']
      })
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u.name]));
    const employeeMap = new Map(employees.map(e => [String(e.id), `${e.firstName} ${e.lastName}`.trim()]));

    const formattedRefunds = refunds.map(r => {
      let performerName = 'System Admin';
      const refBy = r.refundedBy;
      if (refBy) {
        if (userMap.has(refBy)) {
          performerName = userMap.get(refBy);
        } else if (employeeMap.has(refBy)) {
          performerName = employeeMap.get(refBy);
        }
      }

      return {
        id: r.id,
        saleId: r.saleId,
        productId: r.productId,
        quantity: r.quantity,
        amount: parseFloat(r.amount || 0),
        refundAmount: parseFloat(r.refundAmount || 0),
        reason: r.reason || 'Customer Return',
        refundMethod: r.refundMethod || 'cash',
        refundedBy: r.refundedBy,
        refunderName: performerName,
        refundedAt: r.refundedAt || r.createdAt,
        product: r.product,
        sale: r.sale
      };
    });

    const totalPages = Math.ceil(count / limit) || 1;
    res.set('X-Total-Count', String(count));
    res.set('X-Page', String(page));
    res.set('X-Limit', String(limit));
    res.set('X-Total-Pages', String(totalPages));

    if (req.query.format === 'paginated') {
      return res.json({
        data: formattedRefunds,
        pagination: {
          total: count,
          page,
          limit,
          totalPages
        }
      });
    }

    res.json(formattedRefunds);
  } catch (error) {
    console.error('Error fetching all returns:', error);
    res.status(500).json({ error: 'Failed to fetch sales returns' });
  }
};

exports.getCreditNote = async (req, res) => {
  const { saleId } = req.params;
  const shopId = req.shopId || req.user.shopId;

  try {
    const sale = await Sale.findOne({
      where: { id: saleId, shopId },
      include: [
        { model: Customer },
        { model: User, attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const refunds = await SaleRefund.findAll({
      where: { saleId, shopId, status: 'processed' },
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'barcode'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (refunds.length === 0) {
      return res.status(404).json({ error: 'No processed refunds found for this sale' });
    }

    const settings = await SystemSettings.findOne({ where: { shopId } });
    const totalRefundedAmount = refunds.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    const creditNote = {
      creditNoteNumber: `CN-${sale.invoiceNumber || sale.id}`,
      originalInvoiceNumber: sale.invoiceNumber,
      saleId: sale.id,
      issuedAt: refunds[0]?.refundedAt || refunds[0]?.createdAt || new Date(),
      customer: sale.Customer ? {
        name: sale.Customer.name,
        email: sale.Customer.email,
        phone: sale.Customer.phone
      } : { name: sale.customerName || 'Walk-in Customer' },
      items: refunds.map(r => ({
        refundId: r.id,
        productId: r.productId,
        productName: r.product?.name || 'Unknown Product',
        sku: r.product?.sku || 'N/A',
        quantity: r.quantity,
        amount: parseFloat(r.amount),
        taxAmount: parseFloat(r.metadata?.taxAmount || 0),
        taxCategory: r.metadata?.taxCategory || 'standard',
        disposition: r.disposition || 'restock',
        reasonCode: r.reasonCode || 'OTHER',
        reasonNotes: r.reasonNotes || r.reason || ''
      })),
      totalRefundAmount: parseFloat(totalRefundedAmount.toFixed(2)),
      totalTaxRefunded: parseFloat(refunds.reduce((sum, r) => sum + parseFloat(r.metadata?.taxAmount || 0), 0).toFixed(2)),
      paymentMethod: refunds[0]?.refundMethod || sale.paymentMethod,
      shop: {
        systemName: settings?.systemName || 'Zana POS',
        contactEmail: settings?.contactEmail,
        contactPhone: settings?.contactPhone,
        receiptHeader: settings?.receiptHeader,
        receiptFooter: settings?.receiptFooter
      }
    };

    res.json(creditNote);
  } catch (error) {
    console.error('Error fetching credit note:', error);
    res.status(500).json({ error: 'Failed to generate credit note' });
  }
};


