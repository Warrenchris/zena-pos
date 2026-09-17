const { validationResult } = require('express-validator');
const stockTransferService = require('../services/stockTransferService');
const { logActivity } = require('../middleware/logger');
const { Shop } = require('../models');

/**
 * Create a new inter-branch stock transfer
 */
exports.createTransfer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: errors.array()[0]?.msg });
    }

    const { sourceShopId, destinationShopId, productId, quantity, notes } = req.body;

    let organizationId = req.organizationId || req.user?.organizationId;
    const shopId = req.shopId || req.user?.shopId;

    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const idempotencyKey = req.header('Idempotency-Key') || req.header('idempotency-key') || req.body.idempotencyKey;

    const result = await stockTransferService.executeStockTransfer({
      sourceShopId,
      destinationShopId,
      productId,
      quantity,
      notes,
      user: req.user,
      organizationId,
      idempotencyKey
    });

    try {
      await logActivity({
        shopId: sourceShopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'STOCK_TRANSFER',
        entity: 'Product',
        entityId: productId,
        details: `Transferred ${quantity} units from shop ${sourceShopId} to shop ${destinationShopId} (Ref: ${result.reference})`
      });
    } catch (_) {}

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof stockTransferService.TransferError || error.name === 'TransferError') {
      return res.status(error.statusCode || 400).json({ error: error.message });
    }
    console.error('Failed to execute stock transfer:', error);
    res.status(500).json({ error: 'Failed to execute stock transfer', details: error.message });
  }
};

/**
 * Get transfer history for current organization
 */
exports.getTransfers = async (req, res) => {
  try {
    let organizationId = req.organizationId || req.user?.organizationId;
    const shopId = req.shopId || req.user?.shopId;

    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const { page, pageSize } = req.query;

    const result = await stockTransferService.listTransfers({
      organizationId,
      shopId,
      page,
      pageSize
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch transfers:', error);
    res.status(500).json({ error: 'Failed to fetch transfers', details: error.message });
  }
};
