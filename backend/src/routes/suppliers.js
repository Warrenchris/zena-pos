const express = require('express');
const router = express.Router();
const { Supplier, Purchase, PurchaseOrder } = require('../models');
const { Op } = require('sequelize');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const { logActivity } = require('../middleware/logger');

// All routes require authentication, canonical authorization context, and active subscription
router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

// GET /api/suppliers — List suppliers for authenticated organization
router.get('/',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products'
  }),
  async (req, res) => {
  try {
    const organizationId = req.authz?.tenant?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const { search } = req.query;
    const whereClause = { organizationId };

    if (search && search.trim()) {
      const term = search.trim();
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${term}%` } },
        { contactPerson: { [Op.like]: `%${term}%` } },
        { phone: { [Op.like]: `%${term}%` } },
        { email: { [Op.like]: `%${term}%` } }
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
router.post('/',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products'
  }),
  async (req, res) => {
  try {
    const organizationId = req.authz?.tenant?.organizationId;
    const shopId = req.authz?.scope?.activeShopId || req.shopId || null;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const { name, contactPerson, email, phone, address } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const trimmedName = name.trim();

    // Check duplicate supplier name in organization
    const existing = await Supplier.findOne({
      where: { name: trimmedName, organizationId }
    });
    if (existing) {
      return res.status(409).json({ error: `Supplier '${trimmedName}' already exists in this organization` });
    }

    const supplier = await Supplier.create({
      organizationId,
      shopId,
      name: trimmedName,
      contactPerson: contactPerson ? contactPerson.trim() : null,
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null
    });

    await logActivity({
      shopId,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'SUPPLIER_CREATED',
      entity: 'Supplier',
      entityId: supplier.id,
      details: `Created supplier ${supplier.name}`
    });

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Duplicate supplier in this organization' });
    }
    res.status(500).json({ error: error.message || 'Failed to create supplier' });
  }
});

// GET /api/suppliers/:id — Single supplier with history
router.get('/:id',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Supplier.findByPk(req.params.id),
      antiOracle: true
    }
  }),
  async (req, res) => {
  try {
    const organizationId = req.authz?.tenant?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const supplier = await Supplier.findOne({
      where: { id: req.params.id, organizationId },
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

// PUT /api/suppliers/:id — Update supplier
router.put('/:id',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Supplier.findByPk(req.params.id),
      antiOracle: true
    }
  }),
  async (req, res) => {
  try {
    const organizationId = req.authz?.tenant?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const supplier = await Supplier.findOne({
      where: { id: req.params.id, organizationId }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const { name, contactPerson, email, phone, address } = req.body;

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Supplier name cannot be empty' });
      }
      const trimmedName = name.trim();
      if (trimmedName !== supplier.name) {
        const existing = await Supplier.findOne({
          where: { name: trimmedName, organizationId, id: { [Op.ne]: supplier.id } }
        });
        if (existing) {
          return res.status(409).json({ error: `Supplier '${trimmedName}' already exists in this organization` });
        }
        supplier.name = trimmedName;
      }
    }

    if (contactPerson !== undefined) supplier.contactPerson = contactPerson ? contactPerson.trim() : null;
    if (email !== undefined) supplier.email = email ? email.trim() : null;
    if (phone !== undefined) supplier.phone = phone ? phone.trim() : null;
    if (address !== undefined) supplier.address = address ? address.trim() : null;

    await supplier.save();

    await logActivity({
      shopId: supplier.shopId || req.authz?.scope?.activeShopId || null,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'SUPPLIER_UPDATED',
      entity: 'Supplier',
      entityId: supplier.id,
      details: `Updated supplier ${supplier.name}`
    });

    res.json(supplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Duplicate supplier name in this organization' });
    }
    res.status(500).json({ error: error.message || 'Failed to update supplier' });
  }
});

// DELETE /api/suppliers/:id — Delete supplier
router.delete('/:id',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_products',
    ownership: {
      getResource: (req) => Supplier.findByPk(req.params.id),
      antiOracle: true
    }
  }),
  async (req, res) => {
  try {
    const organizationId = req.authz?.tenant?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const supplier = await Supplier.findOne({
      where: { id: req.params.id, organizationId }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Check if supplier has linked purchases or purchase orders
    const purchaseCount = await Purchase.count({ where: { supplierId: supplier.id } });
    const poCount = await PurchaseOrder.count({ where: { supplierId: supplier.id } });

    if (purchaseCount > 0 || poCount > 0) {
      return res.status(400).json({
        error: `Cannot delete supplier with existing purchase records (${purchaseCount} purchases, ${poCount} purchase orders).`
      });
    }

    await logActivity({
      shopId: supplier.shopId || req.authz?.scope?.activeShopId || null,
      performedBy: req.user?.id,
      performedByType: req.user?.isEmployee ? 'employee' : 'user',
      action: 'SUPPLIER_DELETED',
      entity: 'Supplier',
      entityId: supplier.id,
      details: `Deleted supplier ${supplier.name}`
    });

    await supplier.destroy();
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

module.exports = router;
