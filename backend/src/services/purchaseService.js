const { Product, Inventory, StockMovement, Supplier, Expense, PurchaseItem, PurchaseOrderItem, User } = require('../models');
const { invalidateShopProductCache } = require('./productCache');
const { logActivity } = require('../middleware/logger');
const logger = require('../utils/logger');
const { isUuid, isIntegerId } = require('../utils/idKind');

// Map frontend payment methods to Expense ENUM ('cash', 'card', 'bank_transfer', 'mobile_money', 'other')
const mapPaymentMethodToExpense = (method) => {
  const m = (method || '').toUpperCase();
  if (m.includes('CASH')) return 'cash';
  if (m.includes('M-PESA') || m.includes('MPESA') || m.includes('MOBILE')) return 'mobile_money';
  if (m.includes('BANK') || m.includes('TRANSFER')) return 'bank_transfer';
  if (m.includes('CARD')) return 'card';
  return 'other';
};

/**
 * Finds an existing supplier by id or name in this organization or creates one.
 */
async function resolveSupplier({ shopId, organizationId: explicitOrgId, supplierId, supplierName, supplierContact, supplierEmail, supplierPhone }, transaction = null) {
  let organizationId = explicitOrgId;
  if (!organizationId && shopId) {
    const { Shop } = require('../models');
    const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'], transaction });
    organizationId = shop?.organizationId;
  }

  if (supplierId) {
    const existing = await Supplier.findOne({
      where: organizationId ? { id: supplierId, organizationId } : { id: supplierId, shopId },
      transaction
    });
    if (existing) return existing;
    const err = new Error(`Supplier ID ${supplierId} not found in this organization`);
    err.statusCode = 404;
    throw err;
  }

  if (!supplierName || !supplierName.trim()) return null;

  const trimmedName = supplierName.trim();
  let supplier = await Supplier.findOne({
    where: organizationId ? { name: trimmedName, organizationId } : { name: trimmedName, shopId },
    transaction
  });

  if (!supplier) {
    supplier = await Supplier.create({
      organizationId,
      shopId,
      name: trimmedName,
      contactPerson: supplierContact ? supplierContact.trim() : null,
      phone: (supplierPhone || supplierContact) ? (supplierPhone || supplierContact).trim() : null,
      email: supplierEmail ? supplierEmail.trim() : null
    }, { transaction });
  }

  return supplier;
}

/**
 * Atomically increases product inventory, recalculates weighted average cost,
 * and creates StockMovement records.
 */
async function applyStockReceipt({ shopId, items, reference, userId, employeeId, organizationId }, transaction) {
  const stockDeltas = [];

  // Resolve valid user ID or employee ID for foreign key integrity
  let validUserId = null;
  let validEmployeeId = employeeId || null;

  if (userId && !validEmployeeId) {
    if (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      validEmployeeId = userId;
    } else {
      const existingUser = await User.findByPk(userId, { attributes: ['id'], transaction });
      if (existingUser) validUserId = existingUser.id;
    }
  }

  // Sort items by productId ascending before acquiring row locks.
  // This matches the lock-acquisition order used by processRefund and
  // restoreSaleInventoryIfNeeded, preventing lock-inversion deadlocks under
  // concurrent checkout + refund/cancellation traffic (H-01).
  const sortedItems = [...items].sort((a, b) => Number(a.productId) - Number(b.productId));

  for (const item of sortedItems) {
    const qty = parseFloat(item.quantity || item.quantityReceived || 0);
    const unitCost = parseFloat(item.unitCost || 0);

    if (qty > 0 && item.productId) {
      // Row-level lock on the product to prevent concurrent update races
      const productWhere = { id: item.productId };
      if (organizationId) {
        productWhere.organizationId = organizationId;
      }
      const product = await Product.findOne({
        where: productWhere,
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!product) {
        throw new Error(`Product ID ${item.productId} not found`);
      }

      // Lock or explicitly initialize Inventory row for this shop
      let inventory = await Inventory.findOne({
        where: { productId: product.id, shopId },
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!inventory) {
        logger.info(`[purchaseService:applyStockReceipt] Explicitly creating missing Inventory row for productId=${product.id}, shopId=${shopId}`);
        inventory = await Inventory.create({
          productId: product.id,
          shopId,
          stockQuantity: 0,
          reorderPoint: 10
        }, { transaction });
      }

      const prevStock = parseFloat(inventory.stockQuantity || 0);
      const newStock = Math.round((prevStock + qty) * 100) / 100;

      // Weighted average cost calculation
      let newCost = parseFloat(product.cost || 0);
      if (unitCost >= 0) {
        if (prevStock <= 0) {
          newCost = unitCost;
        } else {
          newCost = Math.round((((prevStock * newCost) + (qty * unitCost)) / newStock) * 100) / 100;
        }
      }

      // Primary mutation: Inventory
      await inventory.update({
        stockQuantity: newStock
      }, { transaction });

      // Update Product cost if unitCost supplied
      if (unitCost >= 0) {
        await product.update({
          cost: newCost
        }, { transaction });
      }

      // Create StockMovement audit entry based on Inventory values
      await StockMovement.create({
        shopId,
        organizationId: organizationId || product.organizationId,
        productId: product.id,
        quantity: qty,
        previousStock: prevStock,
        newStock: newStock,
        type: 'PURCHASE_RECEIPT',
        reference: reference || null,
        notes: `Received via ${reference}`,
        userId: validUserId,
        employeeId: validEmployeeId
      }, { transaction });

      stockDeltas.push({
        productId: product.id,
        productName: product.name,
        delta: qty,
        unitCost,
        newStock,
        newCost
      });
    }
  }

  return stockDeltas;
}

/**
 * Atomically reverses product inventory and creates reversal StockMovement records.
 */
async function reverseStockReceipt({ shopId, items, reference, userId, employeeId, organizationId }, transaction) {
  let validUserId = null;
  let validEmployeeId = employeeId || null;

  if (userId && !validEmployeeId) {
    if (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      validEmployeeId = userId;
    } else {
      const existingUser = await User.findByPk(userId, { attributes: ['id'], transaction });
      if (existingUser) validUserId = existingUser.id;
    }
  }

  const requiredByProduct = new Map();
  for (const item of items) {
    const qty = parseFloat(item.quantity || item.quantityReceived || 0);
    if (qty <= 0 || !item.productId) continue;

    const productId = Number(item.productId);
    const required = requiredByProduct.get(productId) || {
      productId,
      productName: item.productName || 'Product',
      quantity: 0
    };
    required.quantity += qty;
    requiredByProduct.set(productId, required);
  }

  const lockedInventory = [];
  const shortages = [];
  const sortedItems = [...requiredByProduct.values()].sort((a, b) => a.productId - b.productId);

  for (const item of sortedItems) {
    const productWhere = { id: item.productId };
    if (organizationId) {
      productWhere.organizationId = organizationId;
    }
    const product = await Product.findOne({
      where: productWhere,
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!product) continue;

    const inventory = await Inventory.findOne({
      where: { productId: product.id, shopId },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const available = inventory ? parseFloat(inventory.stockQuantity || 0) : 0;
    const needed = Math.round(item.quantity * 100) / 100;

    if (available < needed) {
      shortages.push({
        productId: product.id,
        productName: product.name || item.productName,
        needed,
        available
      });
    } else {
      lockedInventory.push({ product, inventory, quantity: needed });
    }
  }

  if (shortages.length > 0) {
    const error = new Error(`Insufficient stock to reverse purchase: ${shortages.map(item => `${item.productName} (needed ${item.needed}, available ${item.available})`).join('; ')}`);
    error.statusCode = 409;
    error.shortages = shortages;
    throw error;
  }

  for (const { product, inventory, quantity } of lockedInventory) {
    const prevStock = parseFloat(inventory.stockQuantity || 0);
    const newStock = Math.round((prevStock - quantity) * 100) / 100;

    await inventory.update({ stockQuantity: newStock }, { transaction });

    await StockMovement.create({
      shopId,
      organizationId: organizationId || product.organizationId,
      productId: product.id,
      quantity: -quantity,
      previousStock: prevStock,
      newStock,
      type: 'PURCHASE_REVERSAL',
      reference: reference || null,
      notes: `Reversal / cancellation of ${reference}`,
      userId: validUserId,
      employeeId: validEmployeeId
    }, { transaction });
  }
}

/**
 * Records purchase payment in Expenses table for financial ledger reconciliation.
 */
async function recordPaymentExpense({ shopId, purchase, amount, paymentMethod, userId }, transaction) {
  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount <= 0) return null;

  let validUserId = null;
  let validEmployeeId = null;
  if (isIntegerId(userId)) {
    const existingUser = await User.findByPk(parseInt(userId, 10), { attributes: ['id'], transaction });
    if (existingUser) validUserId = existingUser.id;
  } else if (isUuid(userId)) {
    validEmployeeId = String(userId).trim();
  }

  const expenseCategory = 'inventory';
  const expensePaymentMethod = mapPaymentMethodToExpense(paymentMethod || purchase.paymentMethod);

  const expense = await Expense.create({
    description: `Purchase Payment: ${purchase.referenceNo} (${purchase.supplierName})`,
    amount: payAmount,
    category: expenseCategory,
    date: new Date(),
    paymentMethod: expensePaymentMethod,
    reference: purchase.referenceNo,
    notes: `Inventory purchase payment for ${purchase.referenceNo}`,
    shopId,
    userId: validUserId,
    employeeId: validEmployeeId
  }, { transaction });

  return expense;
}

async function reversePaymentExpense({ shopId, purchase, userId }, transaction) {
  const netAmount = Number(await Expense.sum('amount', {
    where: {
      shopId,
      reference: purchase.referenceNo,
      category: 'inventory'
    },
    transaction
  }) || 0);

  if (!Number.isFinite(netAmount) || netAmount <= 0) return null;

  let validUserId = null;
  let validEmployeeId = null;
  if (isIntegerId(userId)) {
    const existingUser = await User.findByPk(parseInt(userId, 10), { attributes: ['id'], transaction });
    if (existingUser) validUserId = existingUser.id;
  } else if (isUuid(userId)) {
    validEmployeeId = String(userId).trim();
  }

  return Expense.create({
    description: `Reversal: Purchase Payment: ${purchase.referenceNo} (${purchase.supplierName})`,
    amount: -Math.round(netAmount * 100) / 100,
    category: 'inventory',
    date: new Date(),
    paymentMethod: mapPaymentMethodToExpense(purchase.paymentMethod),
    reference: purchase.referenceNo,
    notes: `Reversal of inventory purchase payments for ${purchase.referenceNo}`,
    shopId,
    userId: validUserId,
    employeeId: validEmployeeId
  }, { transaction });
}

function validatePurchasePayment({ paymentStatus, paymentMethod, paidAmount, totalAmount }) {
  if (!['PAID', 'PARTIAL', 'UNPAID'].includes(paymentStatus)) {
    return { error: 'Payment status must be PAID, PARTIAL, or UNPAID' };
  }

  const normalizedPaymentMethod = typeof paymentMethod === 'string' ? paymentMethod.trim() : '';
  if (!normalizedPaymentMethod || normalizedPaymentMethod.length > 50) {
    return { error: 'Payment method is required and must be 50 characters or fewer' };
  }

  const total = Number(totalAmount);
  if (paymentStatus === 'PARTIAL') {
    const parsedPaidAmount = Number(paidAmount);
    const amount = Math.round(parsedPaidAmount * 100) / 100;
    if (!Number.isFinite(parsedPaidAmount) || amount <= 0 || amount >= total) {
      return { error: 'Partial payment amount must be greater than 0 and less than total amount' };
    }
    return { paymentStatus, paymentMethod: normalizedPaymentMethod, paidAmount: amount };
  }

  return {
    paymentStatus,
    paymentMethod: normalizedPaymentMethod,
    paidAmount: paymentStatus === 'PAID' ? total : 0
  };
}

module.exports = {
  resolveSupplier,
  applyStockReceipt,
  reverseStockReceipt,
  recordPaymentExpense,
  reversePaymentExpense,
  validatePurchasePayment,
  invalidateShopProductCache
};
