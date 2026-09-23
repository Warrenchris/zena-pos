'use strict';

/**
 * Migration: Enforce Database-Level Idempotency Unique Constraints (DB-P2-01)
 *
 * Requirements:
 * 1. Pre-flight check: Detect any existing duplicate data. If duplicates exist, HALT immediately with a descriptive error.
 *    DO NOT automatically delete or alter financial/payment records.
 * 2. Ensure unique composite index on Sales: (shopId, idempotencyKey).
 *    Note: In MySQL InnoDB, multiple NULL values are permitted in a UNIQUE index, preserving sales without client idempotency keys.
 * 3. Ensure unique index on PendingPayments: (checkoutRequestId).
 * 4. Provide safe reversible down method.
 */

async function getExistingIndexes(queryInterface, tableName) {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.map(idx => ({
      name: idx.name || idx.Key_name,
      fields: idx.fields ? idx.fields.map(f => f.attribute || f.name || f.Column_name) : [idx.Column_name],
      unique: !idx.non_unique && !idx.Non_unique
    }));
  } catch (err) {
    return [];
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;

    // -------------------------------------------------------------
    // 1. SALES: Pre-flight duplicate check on (shopId, idempotencyKey)
    // -------------------------------------------------------------
    const [salesDuplicates] = await sequelize.query(`
      SELECT shopId, idempotencyKey, COUNT(*) AS count
      FROM Sales
      WHERE idempotencyKey IS NOT NULL AND TRIM(idempotencyKey) != ''
      GROUP BY shopId, idempotencyKey
      HAVING count > 1
    `);

    if (salesDuplicates && salesDuplicates.length > 0) {
      const details = salesDuplicates.map(d => `Shop: ${d.shopId}, Key: ${d.idempotencyKey} (Count: ${d.count})`).join('; ');
      throw new Error(
        `[DB-P2-01 HALT] Cannot enforce unique constraint. Existing duplicate Sales idempotency keys detected: ${details}. Manual non-destructive reconciliation required.`
      );
    }

    // -------------------------------------------------------------
    // 2. SALES: Ensure unique index on (shopId, idempotencyKey)
    // -------------------------------------------------------------
    const salesIndexes = await getExistingIndexes(queryInterface, 'Sales');
    const hasSalesIdempotencyIndex = salesIndexes.some(
      idx => idx.name === 'unique_sales_shop_idempotency_key' ||
        (idx.unique && idx.fields && idx.fields.length === 2 && idx.fields.includes('shopId') && idx.fields.includes('idempotencyKey'))
    );

    if (!hasSalesIdempotencyIndex) {
      await queryInterface.addIndex('Sales', ['shopId', 'idempotencyKey'], {
        name: 'unique_sales_shop_idempotency_key',
        unique: true
      });
      console.log('[DB-P2-01] Added unique index unique_sales_shop_idempotency_key on Sales(shopId, idempotencyKey)');
    } else {
      console.log('[DB-P2-01] Verified existing unique index on Sales(shopId, idempotencyKey)');
    }

    // -------------------------------------------------------------
    // 3. PENDING PAYMENTS: Pre-flight duplicate check on checkoutRequestId
    // -------------------------------------------------------------
    const [pendingDuplicates] = await sequelize.query(`
      SELECT checkoutRequestId, COUNT(*) AS count
      FROM PendingPayments
      WHERE checkoutRequestId IS NOT NULL AND TRIM(checkoutRequestId) != ''
      GROUP BY checkoutRequestId
      HAVING count > 1
    `);

    if (pendingDuplicates && pendingDuplicates.length > 0) {
      const details = pendingDuplicates.map(d => `CheckoutRequestID: ${d.checkoutRequestId} (Count: ${d.count})`).join('; ');
      throw new Error(
        `[DB-P2-01 HALT] Cannot enforce unique constraint. Existing duplicate PendingPayment checkoutRequestIds detected: ${details}. Manual non-destructive reconciliation required.`
      );
    }

    // -------------------------------------------------------------
    // 4. PENDING PAYMENTS: Ensure unique index on checkoutRequestId
    // -------------------------------------------------------------
    const pendingIndexes = await getExistingIndexes(queryInterface, 'PendingPayments');
    const hasPendingUniqueIndex = pendingIndexes.some(
      idx => (idx.name === 'checkoutRequestId' || idx.name === 'unique_pending_payments_checkout_request_id') && idx.unique
    );

    if (!hasPendingUniqueIndex) {
      await queryInterface.addIndex('PendingPayments', ['checkoutRequestId'], {
        name: 'unique_pending_payments_checkout_request_id',
        unique: true
      });
      console.log('[DB-P2-01] Added unique index unique_pending_payments_checkout_request_id on PendingPayments(checkoutRequestId)');
    } else {
      console.log('[DB-P2-01] Verified existing unique index on PendingPayments(checkoutRequestId)');
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeIndex('Sales', 'unique_sales_shop_idempotency_key');
      console.log('[DB-P2-01] Removed unique index unique_sales_shop_idempotency_key from Sales');
    } catch (e) {
      console.warn('[DB-P2-01] Notice: unique_sales_shop_idempotency_key could not be dropped or was preserved:', e.message);
    }

    try {
      await queryInterface.removeIndex('PendingPayments', 'unique_pending_payments_checkout_request_id');
      console.log('[DB-P2-01] Removed unique index unique_pending_payments_checkout_request_id from PendingPayments');
    } catch (e) {
      console.warn('[DB-P2-01] Notice: unique_pending_payments_checkout_request_id was not dropped:', e.message);
    }
  }
};
