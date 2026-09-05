const { Product, StockMovement, Supplier, Expense, PurchaseItem, PurchaseOrderItem, User } = require('../models');
const { invalidateShopProductCache } = require('./productCache');
const { logActivity } = require('../middleware/logger');

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
 * Finds an existing supplier by name (case-insensitive) in this shop or creates one.
 */
async function resolveSupplier({ shopId, supplierId, supplierName, supplierContact, supplierEmail, supplierPhone }, transaction = null) {
  if (supplierId) {
    const existing = await Supplier.findOne({ where: { id: supplierId, shopId }, transaction });
    if (existing) return existing;
  }

  if (!supplierName || !supplierName.trim()) return null;

  const trimmedName = supplierName.trim();
  let supplier = await Supplier.findOne({
    where: { shopId, name: trimmedName },
    transaction
  });

  if (!supplier) {
    supplier = await Supplier.create({
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
async function applyStockReceipt({ shopId, items, reference, userId }, transaction) {
  const stockDeltas = [];

  // Resolve valid user ID for foreign key integrity
  let validUserId = null;
  if (userId) {
    const existingUser = await User.findByPk(userId, { attributes: ['id'], transaction });
    if (existingUser) validUserId = existingUser.id;
  }

  for (const item of items) {
    const qty = parseFloat(item.quantity || item.quantityReceived || 0);
    const unitCost = parseFloat(item.unitCost || 0);

    if (qty > 0 && item.productId) {
      // Row-level lock on the product to prevent concurrent update races
      const product = await Product.findOne({
        where: { id: item.productId, shopId },
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!product) {
        throw new Error(`Product ID ${item.productId} not found in shop ${shopId}`);
      }

      const prevStock = parseFloat(product.stockQuantity || 0);
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

      await product.update({
        stockQuantity: newStock,
        cost: newCost
      }, { transaction });

      // Create StockMovement audit entry
      await StockMovement.create({
        shopId,
        productId: product.id,
        quantity: qty,
        previousStock: prevStock,
        newStock: newStock,
        type: 'PURCHASE_RECEIPT',
        reference: reference || null,
        notes: `Received via ${reference}`,
        userId: validUserId
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
async function reverseStockReceipt({ shopId, items, reference, userId }, transaction) {
  let validUserId = null;
  if (userId) {
    const existingUser = await User.findByPk(userId, { attributes: ['id'], transaction });
    if (existingUser) validUserId = existingUser.id;
  }

  for (const item of items) {
    const qty = parseFloat(item.quantity || 0);

    if (qty > 0 && item.productId) {
      const product = await Product.findOne({
        where: { id: item.productId, shopId },
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (product) {
        const prevStock = parseFloat(product.stockQuantity || 0);
        const newStock = Math.max(0, Math.round((prevStock - qty) * 100) / 100);

        await product.update({ stockQuantity: newStock }, { transaction });

        await StockMovement.create({
          shopId,
          productId: product.id,
          quantity: -qty,
          previousStock: prevStock,
          newStock: newStock,
          type: 'PURCHASE_REVERSAL',
          reference: reference || null,
          notes: `Reversal / cancellation of ${reference}`,
          userId: validUserId
        }, { transaction });
      }
    }
  }
}

/**
 * Records purchase payment in Expenses table for financial ledger reconciliation.
 */
async function recordPaymentExpense({ shopId, purchase, amount, paymentMethod, userId }, transaction) {
  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount <= 0) return null;

  let validUserId = null;
  if (userId) {
    const existingUser = await User.findByPk(userId, { attributes: ['id'], transaction });
    if (existingUser) validUserId = existingUser.id;
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
    userId: validUserId
  }, { transaction });

  return expense;
}

module.exports = {
  resolveSupplier,
  applyStockReceipt,
  reverseStockReceipt,
  recordPaymentExpense,
  invalidateShopProductCache
};
