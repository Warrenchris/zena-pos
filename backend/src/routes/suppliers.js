const express = require('express');
const router = express.Router();
const { Supplier, Purchase, PurchaseOrder } = require('../models');
const { Op } = require('sequelize');
const { auth, checkRole } = require('../middleware/auth');

router.use(auth);

// GET /api/suppliers — List suppliers for authenticated tenant shop
router.get('/', async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      return res.status(403).json({ error: 'Shop context required' });
    }

    const { search } = req.query;
    const whereClause = { shopId };

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { contactPerson: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const suppliers = await Supplier.findAll({
      where: whereClause,
      order: [['name', 'ASC']]
    });

    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// POST /api/suppliers — Create supplier
router.post('/', checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    if (!shopId) {
      return res.status(403).json({ error: 'Shop context required' });
    }

    const { name, contactPerson, email, phone, address } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const supplier = await Supplier.create({
      shopId,
      name: name.trim(),
      contactPerson: contactPerson ? contactPerson.trim() : null,
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null
    });

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: error.message || 'Failed to create supplier' });
  }
});

// GET /api/suppliers/:id — Single supplier with history
router.get('/:id', async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    const supplier = await Supplier.findOne({
      where: { id: req.params.id, shopId },
      include: [
        { model: Purchase, as: 'purchases', limit: 10, order: [['createdAt', 'DESC']] },
        { model: PurchaseOrder, as: 'purchaseOrders', limit: 10, order: [['createdAt', 'DESC']] }
      ]
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier details' });
  }
});

module.exports = router;
