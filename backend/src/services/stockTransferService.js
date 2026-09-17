const crypto = require('crypto');
const { sequelize, Product, Inventory, Shop, StockMovement, User, Employee, StockTransfer } = require('../models');
const { invalidateShopProductCache } = require('./productCache');
const logger = require('../utils/logger');

/**
 * Custom error with HTTP status code
 */
class TransferError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TransferError';
    this.statusCode = statusCode;
  }
}

/**
 * Execute an atomic stock transfer between two shops in the same organization.
 * Uses deterministic row locking to prevent deadlocks under high concurrency.
 * Supports tenant-scoped durable idempotency via Idempotency-Key.
 */
async function executeStockTransfer({
  sourceShopId,
  destinationShopId,
  productId,
  quantity,
  notes,
  user,
  organizationId,
  idempotencyKey
}) {
  const srcId = parseInt(sourceShopId, 10);
  const dstId = parseInt(destinationShopId, 10);
  const prodId = parseInt(productId, 10);
  const transferQty = parseFloat(quantity);

  if (isNaN(srcId) || isNaN(dstId) || isNaN(prodId) || isNaN(transferQty)) {
    throw new TransferError('sourceShopId, destinationShopId, productId, and quantity are required.', 400);
  }

  if (transferQty <= 0) {
    throw new TransferError('Transfer quantity must be a positive number.', 400);
  }

  if (srcId === dstId) {
    throw new TransferError('Source and destination shops must be different.', 400);
  }

  // 1. Resolve & Validate Organization Context
  let resolvedOrgId = organizationId ? parseInt(organizationId, 10) : (user?.organizationId ? parseInt(user.organizationId, 10) : null);
  if (!resolvedOrgId) {
    const srcShop = await Shop.findByPk(srcId, { attributes: ['organizationId'] });
    resolvedOrgId = srcShop?.organizationId;
  }

  if (!resolvedOrgId) {
    throw new TransferError('Organization context is required for stock transfers.', 403);
  }

  // Clean and normalize idempotencyKey
  const cleanIdempotencyKey = (typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0)
    ? idempotencyKey.trim().slice(0, 255)
    : null;

  // Canonical payload hash to detect parameter changes on key reuse
  const canonicalPayload = {
    sourceShopId: srcId,
    destinationShopId: dstId,
    productId: prodId,
    quantity: transferQty
  };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

  // Idempotency: Pre-transaction check for sequential replayed request
  if (cleanIdempotencyKey) {
    const existingTransfer = await StockTransfer.findOne({
      where: {
        organizationId: resolvedOrgId,
        idempotencyKey: cleanIdempotencyKey
      }
    });

    if (existingTransfer) {
      if (existingTransfer.requestHash !== requestHash) {
        throw new TransferError('Idempotency key was already used with different transfer parameters.', 422);
      }
      return typeof existingTransfer.responsePayload === 'string'
        ? JSON.parse(existingTransfer.responsePayload)
        : existingTransfer.responsePayload;
    }
  }

  // 2. Validate both shops belong to the caller's organization
  const [sourceShop, destinationShop] = await Promise.all([
    Shop.findOne({ where: { id: srcId, organizationId: resolvedOrgId, active: true } }),
    Shop.findOne({ where: { id: dstId, organizationId: resolvedOrgId, active: true } })
  ]);

  if (!sourceShop) {
    throw new TransferError('Source shop not found or does not belong to your organization.', 403);
  }
  if (!destinationShop) {
    throw new TransferError('Destination shop not found or does not belong to your organization.', 403);
  }

  // 3. Validate product belongs to the organization (or source shop)
  const product = await Product.findOne({
    where: {
      id: prodId,
      active: true,
      organizationId: resolvedOrgId
    }
  });

  if (!product) {
    throw new TransferError('Product not found or does not belong to your organization.', 404);
  }

  // 4. Resolve actor attribution
  const isEmployee = Boolean(user?.isEmployee);
  const employeeId = isEmployee ? (user?.id || user?.employeeId) : null;
  let validUserId = null;
  if (!isEmployee && user?.id && typeof user.id === 'number') {
    validUserId = user.id;
  }

  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const reference = `TRF-${timestamp}-${randomSuffix}`;

  let transferResult = null;

  try {
    // 5. Atomic transaction with deterministic row locking to prevent deadlocks
    await sequelize.transaction(async (t) => {
      // Re-check idempotency inside transaction if key provided
      if (cleanIdempotencyKey) {
        const txExisting = await StockTransfer.findOne({
          where: {
            organizationId: resolvedOrgId,
            idempotencyKey: cleanIdempotencyKey
          },
          transaction: t
        });
        if (txExisting) {
          if (txExisting.requestHash !== requestHash) {
            throw new TransferError('Idempotency key was already used with different transfer parameters.', 422);
          }
          transferResult = typeof txExisting.responsePayload === 'string'
            ? JSON.parse(txExisting.responsePayload)
            : txExisting.responsePayload;
          return;
        }
      }

      // Sort shop IDs so locks are always acquired in identical global ascending order
      const firstShopId = Math.min(srcId, dstId);
      const secondShopId = Math.max(srcId, dstId);

      // Lock first inventory row
      let firstInv = await Inventory.findOne({
        where: { productId: prodId, shopId: firstShopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!firstInv) {
        firstInv = await Inventory.create({
          productId: prodId,
          shopId: firstShopId,
          stockQuantity: 0,
          reorderPoint: 10
        }, { transaction: t });
      }

      // Lock second inventory row
      let secondInv = await Inventory.findOne({
        where: { productId: prodId, shopId: secondShopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!secondInv) {
        secondInv = await Inventory.create({
          productId: prodId,
          shopId: secondShopId,
          stockQuantity: 0,
          reorderPoint: 10
        }, { transaction: t });
      }

      const srcInv = (firstShopId === srcId) ? firstInv : secondInv;
      const dstInv = (firstShopId === dstId) ? firstInv : secondInv;

      const currentSourceStock = parseFloat(srcInv.stockQuantity || 0);
      const currentDestStock = parseFloat(dstInv.stockQuantity || 0);

      // Verify sufficient stock at source
      if (currentSourceStock < transferQty) {
        throw new TransferError(
          `Insufficient stock at ${sourceShop.name}. Available: ${currentSourceStock}, Requested: ${transferQty}`,
          409
        );
      }

      const newSourceStock = Math.round((currentSourceStock - transferQty) * 100) / 100;
      const newDestStock = Math.round((currentDestStock + transferQty) * 100) / 100;

      // Mutate inventory quantities
      await srcInv.update({ stockQuantity: newSourceStock }, { transaction: t });
      await dstInv.update({ stockQuantity: newDestStock }, { transaction: t });

      // Paired StockMovements
      // Source movement (negative quantity)
      await StockMovement.create({
        shopId: srcId,
        organizationId: resolvedOrgId,
        productId: prodId,
        quantity: -transferQty,
        previousStock: currentSourceStock,
        newStock: newSourceStock,
        type: 'TRANSFER',
        reference,
        notes: notes
          ? `Transferred to ${destinationShop.name}: ${notes}`
          : `Transferred to ${destinationShop.name}`,
        userId: validUserId,
        employeeId
      }, { transaction: t });

      // Destination movement (positive quantity)
      await StockMovement.create({
        shopId: dstId,
        organizationId: resolvedOrgId,
        productId: prodId,
        quantity: transferQty,
        previousStock: currentDestStock,
        newStock: newDestStock,
        type: 'TRANSFER',
        reference,
        notes: notes
          ? `Transferred from ${sourceShop.name}: ${notes}`
          : `Transferred from ${sourceShop.name}`,
        userId: validUserId,
        employeeId
      }, { transaction: t });

      transferResult = {
        reference,
        productId: prodId,
        productName: product.name,
        sku: product.sku,
        quantity: transferQty,
        sourceShopId: srcId,
        sourceShopName: sourceShop.name,
        destinationShopId: dstId,
        destinationShopName: destinationShop.name,
        sourceNewStock: newSourceStock,
        destinationNewStock: newDestStock,
        status: 'COMPLETED',
        notes: notes || null,
        transferredAt: new Date()
      };

      // Persist durable StockTransfer record participating in the same transaction
      await StockTransfer.create({
        organizationId: resolvedOrgId,
        idempotencyKey: cleanIdempotencyKey,
        requestHash,
        reference,
        sourceShopId: srcId,
        destinationShopId: dstId,
        productId: prodId,
        quantity: transferQty,
        notes: notes || null,
        responsePayload: transferResult,
        status: 'COMPLETED',
        userId: validUserId,
        employeeId
      }, { transaction: t });
    });
  } catch (err) {
    // If unique constraint collision happened on (organizationId, idempotencyKey) due to concurrent duplicate
    if (cleanIdempotencyKey && (err.name === 'SequelizeUniqueConstraintError' || err.message?.includes('unique_stock_transfers_org_idempotency_key') || err.parent?.code === 'ER_DUP_ENTRY')) {
      const concurrentCommitted = await StockTransfer.findOne({
        where: {
          organizationId: resolvedOrgId,
          idempotencyKey: cleanIdempotencyKey
        }
      });
      if (concurrentCommitted) {
        if (concurrentCommitted.requestHash !== requestHash) {
          throw new TransferError('Idempotency key was already used with different transfer parameters.', 422);
        }
        return typeof concurrentCommitted.responsePayload === 'string'
          ? JSON.parse(concurrentCommitted.responsePayload)
          : concurrentCommitted.responsePayload;
      }
    }
    throw err;
  }

  // 6. Invalidate caches for both shops post-commit
  try {
    await Promise.all([
      invalidateShopProductCache(srcId),
      invalidateShopProductCache(dstId)
    ]);
  } catch (cacheErr) {
    logger.warn(`[stockTransferService] Failed to invalidate product cache after transfer: ${cacheErr.message}`);
  }

  return transferResult;
}

/**
 * List transfer movements for the current organization or shop.
 */
async function listTransfers({ organizationId, shopId, page = 1, pageSize = 50 }) {
  const where = { type: 'TRANSFER' };
  if (organizationId) {
    where.organizationId = organizationId;
  } else if (shopId) {
    where.shopId = shopId;
  }

  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(pageSize, 10)));
  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

  const { rows, count } = await StockMovement.findAndCountAll({
    where,
    include: [
      { model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'price'] },
      { model: Shop, attributes: ['id', 'name'] },
      { model: Employee, as: 'employee', attributes: ['id', 'firstName', 'lastName'] },
      { model: User, as: 'user', attributes: ['id', 'name', 'username'] }
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  return {
    transfers: rows,
    total: count,
    page: Math.max(1, parseInt(page, 10)),
    pageSize: limit
  };
}

module.exports = {
  executeStockTransfer,
  listTransfers,
  TransferError
};
