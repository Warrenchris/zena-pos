const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const { HeldCart, Shop } = require('../models');
const { Op } = require('sequelize');

router.use(auth);
router.use(authzContext);

const getAuthorizedShopId = (req) => {
  return req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
};

const heldCartOwnershipPolicy = {
  getResource: (req) => HeldCart.findOne({
    where: { id: req.params.id },
    include: [{ model: Shop, attributes: ['organizationId'] }]
  }),
  getOwnerId: (resource) => resource.cashierId,
  managerPermission: 'manage_held_carts',
  antiOracle: true
};

// POST /api/held-carts - Hold a cart
router.post('/',
  authorize({
    permissions: { any: ['create_sales', 'access_pos', 'manage_held_carts'] },
    shopScope: 'current'
  }),
  async (req, res) => {
    try {
      const { label, items, customer, discounts } = req.body;
      const shopId = getAuthorizedShopId(req);
      // Identity derived strictly from authenticated session context
      const cashierId = String(req.authz.identity.id);

      const heldAt = new Date();
      const expiresAt = new Date(heldAt.getTime() + 4 * 60 * 60 * 1000); // 4 hours

      const heldCart = await HeldCart.create({
        shopId,
        cashierId,
        label: label ? String(label).trim() : `Customer ${Date.now()}`,
        cartSnapshot: { items, customer, discounts },
        heldAt,
        expiresAt,
        status: 'held'
      });

      res.status(201).json(heldCart);
    } catch (error) {
      console.error('Error holding cart:', error);
      res.status(500).json({ error: 'Failed to hold cart' });
    }
  }
);

// GET /api/held-carts - Get held carts for the shop (scoped by cashier ownership or manager override)
router.get('/',
  authorize({
    permissions: { any: ['create_sales', 'access_pos', 'manage_held_carts'] },
    shopScope: 'current'
  }),
  async (req, res) => {
    try {
      const shopId = getAuthorizedShopId(req);
      const now = new Date();

      const where = {
        shopId,
        status: 'held',
        expiresAt: {
          [Op.gt]: now
        }
      };

      // Branch manager, admin, or org_admin has branch-wide visibility
      const canManageBranchCarts = req.authz.ownership.canManage(null, 'manage_held_carts');
      if (!canManageBranchCarts) {
        // Cashiers can only view their own held carts
        where.cashierId = String(req.authz.identity.id);
      }

      const heldCarts = await HeldCart.findAll({
        where,
        order: [['heldAt', 'DESC']]
      });

      res.json(heldCarts);
    } catch (error) {
      console.error('Error fetching held carts:', error);
      res.status(500).json({ error: 'Failed to fetch held carts' });
    }
  }
);

// POST /api/held-carts/:id/recall - Recall a held cart (cashier owner or branch manager)
router.post('/:id/recall',
  authorize({
    permissions: { any: ['create_sales', 'access_pos', 'manage_held_carts'] },
    shopScope: 'current',
    ownership: heldCartOwnershipPolicy
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const shopId = getAuthorizedShopId(req);

      const heldCart = await HeldCart.findOne({
        where: {
          id,
          shopId,
          status: 'held',
          expiresAt: {
            [Op.gt]: new Date()
          }
        }
      });

      if (!heldCart) {
        return res.status(404).json({ error: 'Held cart not found or expired' });
      }

      await heldCart.update({ status: 'recalled' });

      res.json(heldCart.cartSnapshot);
    } catch (error) {
      console.error('Error recalling cart:', error);
      res.status(500).json({ error: 'Failed to recall cart' });
    }
  }
);

// DELETE /api/held-carts/:id - Hard delete a held cart (cashier owner or branch manager)
router.delete('/:id',
  authorize({
    permissions: { any: ['create_sales', 'access_pos', 'manage_held_carts'] },
    shopScope: 'current',
    ownership: heldCartOwnershipPolicy
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const shopId = getAuthorizedShopId(req);

      const heldCart = await HeldCart.findOne({
        where: {
          id,
          shopId
        }
      });

      if (!heldCart) {
        return res.status(404).json({ error: 'Held cart not found' });
      }

      await heldCart.destroy();

      res.json({ message: 'Held cart dismissed successfully' });
    } catch (error) {
      console.error('Error deleting held cart:', error);
      res.status(500).json({ error: 'Failed to delete held cart' });
    }
  }
);

module.exports = router;
