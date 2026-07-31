const express = require('express');
const router = express.Router();
const { PurchaseOrder, Purchase, Product, sequelize } = require('../models');
const { Op } = require('sequelize');

// Helper to generate PO numbers
const generatePoNumber = async () => {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `PO-2026-${timestamp}${random}`;
};

// GET /api/purchase-orders — List all POs
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;

    const whereClause = {};
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }
    if (search) {
      whereClause[Op.or] = [
        { poNumber: { [Op.like]: `%${search}%` } },
        { supplierName: { [Op.like]: `%${search}%` } }
      ];
    }

    let orders = await PurchaseOrder.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // Seed initial demo purchase orders if empty
    if (orders.length === 0 && !search && !status) {
      const demoOrders = [
        {
          poNumber: 'PO-2026-9011',
          supplierName: 'Kenyan Beverages Distributors Ltd',
          supplierEmail: 'orders@kenyanbeverages.co.ke',
          supplierPhone: '+254711223344',
          orderDate: new Date(Date.now() - 86400000 * 3),
          expectedDeliveryDate: new Date(Date.now() + 86400000 * 2),
          status: 'ORDERED',
          totalAmount: 52000.00,
          notes: 'Monthly soda & juice inventory replenishment',
          items: [
            { productId: 1, productName: 'Coca-Cola Soda 1.25L', sku: 'CC-1250ML', quantityOrdered: 150, quantityReceived: 0, unitCost: 280, subtotal: 42000 },
            { productId: 2, productName: 'Safari Lager Beer 500ml', sku: 'SL-500ML', quantityOrdered: 50, quantityReceived: 0, unitCost: 200, subtotal: 10000 }
          ]
        },
        {
          poNumber: 'PO-2026-9012',
          supplierName: 'Eldoret Dairy Co-operative',
          supplierEmail: 'supply@eldoretdairy.co.ke',
          supplierPhone: '+254722889900',
          orderDate: new Date(Date.now() - 86400000 * 1),
          expectedDeliveryDate: new Date(Date.now() + 86400000 * 1),
          status: 'ORDERED',
          totalAmount: 24000.00,
          notes: 'Fresh milk supply for Westlands branch',
          items: [
            { productId: 4, productName: 'Fresh Whole Milk 500ml', sku: 'FM-500ML', quantityOrdered: 300, quantityReceived: 0, unitCost: 65, subtotal: 19500 },
            { productId: 5, productName: 'Strawberry Yoghurt 250ml', sku: 'SY-250ML', quantityOrdered: 41, quantityReceived: 0, unitCost: 110, subtotal: 4510 }
          ]
        },
        {
          poNumber: 'PO-2026-9010',
          supplierName: 'Highland Grain Millers',
          supplierEmail: 'sales@highlandgrain.co.ke',
          supplierPhone: '+254733445566',
          orderDate: new Date(Date.now() - 86400000 * 10),
          expectedDeliveryDate: new Date(Date.now() - 86400000 * 5),
          status: 'RECEIVED',
          totalAmount: 78000.00,
          notes: 'Flour crates delivered and verified',
          items: [
            { productId: 3, productName: 'Ungamill Premium Maize Flour 2kg', sku: 'UM-2KG', quantityOrdered: 300, quantityReceived: 300, unitCost: 260, subtotal: 78000 }
          ]
        }
      ];

      await PurchaseOrder.bulkCreate(demoOrders);
      orders = await PurchaseOrder.findAll({ order: [['createdAt', 'DESC']] });
    }

    res.json(orders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

// GET /api/purchase-orders/:id — Fetch single PO
router.get('/:id', async (req, res) => {
  try {
    const order = await PurchaseOrder.findByPk(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

// POST /api/purchase-orders — Create PO
router.post('/', async (req, res) => {
  try {
    const {
      supplierName,
      supplierEmail,
      supplierPhone,
      orderDate,
      expectedDeliveryDate,
      status = 'ORDERED',
      notes,
      items = []
    } = req.body;

    if (!supplierName || !supplierName.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one product item is required' });
    }

    const totalAmount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantityOrdered || item.quantity || 0);
      const cost = parseFloat(item.unitCost || 0);
      return sum + (qty * cost);
    }, 0);

    const poNumber = await generatePoNumber();

    const formattedItems = items.map(i => ({
      productId: i.productId,
      productName: i.productName || 'Product',
      sku: i.sku || '',
      quantityOrdered: parseFloat(i.quantityOrdered || i.quantity || 0),
      quantityReceived: 0,
      unitCost: parseFloat(i.unitCost || 0),
      subtotal: parseFloat(i.quantityOrdered || i.quantity || 0) * parseFloat(i.unitCost || 0)
    }));

    const po = await PurchaseOrder.create({
      poNumber,
      supplierName: supplierName.trim(),
      supplierEmail: supplierEmail ? supplierEmail.trim() : null,
      supplierPhone: supplierPhone ? supplierPhone.trim() : null,
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      status,
      totalAmount,
      notes: notes ? notes.trim() : null,
      items: formattedItems
    });

    res.status(201).json(po);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: error.message || 'Failed to create purchase order' });
  }
});

// PATCH /api/purchase-orders/:id/status — Update PO Status (Receiving PO converts to Purchase & adds Stock)
router.patch('/:id/status', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { status } = req.body;
    const po = await PurchaseOrder.findByPk(req.params.id, { transaction });

    if (!po) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    const previousStatus = po.status;
    po.status = status;

    // If changing status to RECEIVED (and wasn't previously RECEIVED)
    if (status === 'RECEIVED' && previousStatus !== 'RECEIVED') {
      const purchaseRef = `PUR-${po.poNumber.replace('PO-', '')}`;

      const purchaseItems = (po.items || []).map(item => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantityOrdered || item.quantity || 0,
        unitCost: item.unitCost || 0,
        totalCost: (item.quantityOrdered || item.quantity || 0) * (item.unitCost || 0)
      }));

      // Create linked Purchase record
      await Purchase.create({
        referenceNo: purchaseRef,
        supplierName: po.supplierName,
        supplierContact: po.supplierPhone || po.supplierEmail,
        purchaseDate: new Date(),
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        paymentMethod: 'BANK TRANSFER',
        totalAmount: po.totalAmount,
        notes: `Automatically generated from ${po.poNumber}`,
        items: purchaseItems
      }, { transaction });

      // Auto increment inventory stock for each product in PO
      for (const item of purchaseItems) {
        if (item.productId) {
          const product = await Product.findByPk(item.productId, { transaction });
          if (product) {
            const addQty = parseInt(item.quantity || 0, 10);
            if (!isNaN(addQty) && addQty > 0) {
              await product.increment('stockQuantity', { by: addQty, transaction });
            }
          }
        }
      }

      // Mark items quantityReceived = quantityOrdered
      po.items = (po.items || []).map(i => ({
        ...i,
        quantityReceived: i.quantityOrdered
      }));
    }

    await po.save({ transaction });
    await transaction.commit();

    res.json(po);
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating purchase order status:', error);
    res.status(500).json({ error: error.message || 'Failed to update purchase order status' });
  }
});

// DELETE /api/purchase-orders/:id — Delete PO
router.delete('/:id', async (req, res) => {
  try {
    const po = await PurchaseOrder.findByPk(req.params.id);
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
